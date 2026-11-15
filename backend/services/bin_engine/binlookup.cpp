// VeriSec BIN lookup engine — a memory-mapped, binary-search longest-prefix
// index over card BIN ranges. Built once from a normalized CSV, then loaded by
// mmap (zero parse at startup) and queried in well under a microsecond.
//
// Why this shape:
//   * Variable BIN precision (6..11 digits) is handled by keying each record on
//     (prefix_value, prefix_length) and, at query time, probing the PAN's
//     11,10,...,6-digit prefixes and taking the LONGEST that hits. That is at
//     most 6 binary searches over one sorted uint64 array — branch-predictable,
//     cache-friendly, no hashing, no allocations.
//   * The file is mmap'd read-only and shared across processes; loading is just
//     an mmap() call, so many workers share one copy of the DB in RAM.
//
// File format (little-endian):
//   magic[8]      "VSBIN01\0"
//   count         u32                       number of records
//   blob_len      u32                       bytes in the record blob
//   keys[count]   u64   sorted ascending    key = prefix_value*16 + prefix_len
//   offs[count+1] u32                       blob offsets; record i = blob[offs[i]..offs[i+1])
//   blob[blob_len]                          records, each = tab-joined fields (no newline)

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

namespace py = pybind11;

static const char MAGIC[8] = {'V', 'S', 'B', 'I', 'N', '0', '1', '\0'};

// prefix (<= 11 digits, < 2^37) and length (6..11) packed into one sorted key.
static inline uint64_t pack_key(uint64_t prefix, uint32_t len) { return (prefix << 4) | (len & 0xF); }

// -----------------------------------------------------------------------------
// Build: normalized CSV -> .binidx
// -----------------------------------------------------------------------------
// Input CSV: first line is a header; column 0 is the BIN prefix (digits), the
// remaining columns are the record fields, in the order the caller wants them
// back. Rows are de-duplicated by (prefix,len): the FIRST occurrence wins, so
// the caller feeds sources in priority order (best/most-trusted first).

static py::dict build_index(const std::string &csv_path, const std::string &out_path) {
    std::ifstream in(csv_path);
    if (!in) throw std::runtime_error("cannot open input CSV: " + csv_path);

    std::string header;
    std::getline(in, header);  // discard header line

    std::vector<uint64_t> keys;
    std::vector<std::string> records;
    std::unordered_map<uint64_t, uint32_t> seen;  // key -> record index (first wins)
    keys.reserve(1u << 20);
    records.reserve(1u << 20);
    seen.reserve(1u << 21);

    uint64_t total = 0, dupes = 0, bad = 0;
    std::string line;
    while (std::getline(in, line)) {
        if (line.empty()) continue;
        if (!line.empty() && line.back() == '\r') line.pop_back();
        ++total;

        // Split off the first field (prefix) at the first comma.
        size_t comma = line.find(',');
        if (comma == std::string::npos) { ++bad; continue; }
        std::string prefix = line.substr(0, comma);

        // Validate prefix: all digits, length 6..11.
        if (prefix.size() < 6 || prefix.size() > 11) { ++bad; continue; }
        uint64_t pv = 0;
        bool ok = true;
        for (char c : prefix) {
            if (c < '0' || c > '9') { ok = false; break; }
            pv = pv * 10 + (uint64_t)(c - '0');
        }
        if (!ok) { ++bad; continue; }

        uint64_t key = pack_key(pv, (uint32_t)prefix.size());
        if (seen.count(key)) { ++dupes; continue; }

        // Record = everything after the first comma, with commas turned into
        // tabs so the field separator can never collide with data commas that
        // the merge step already stripped.
        std::string rec = line.substr(comma + 1);
        for (char &c : rec) if (c == ',') c = '\t';

        seen.emplace(key, (uint32_t)records.size());
        keys.push_back(key);
        records.push_back(std::move(rec));
    }

    // Sort records by key while keeping key<->record aligned.
    std::vector<uint32_t> order(keys.size());
    for (uint32_t i = 0; i < order.size(); ++i) order[i] = i;
    std::sort(order.begin(), order.end(), [&](uint32_t a, uint32_t b) { return keys[a] < keys[b]; });

    std::vector<uint64_t> skeys(keys.size());
    std::vector<uint32_t> offs(keys.size() + 1, 0);
    std::string blob;
    blob.reserve(records.size() * 48);
    for (uint32_t i = 0; i < order.size(); ++i) {
        skeys[i] = keys[order[i]];
        blob += records[order[i]];
        offs[i + 1] = (uint32_t)blob.size();
    }

    std::ofstream out(out_path, std::ios::binary);
    if (!out) throw std::runtime_error("cannot open output: " + out_path);
    uint32_t count = (uint32_t)skeys.size();
    uint32_t blob_len = (uint32_t)blob.size();
    out.write(MAGIC, 8);
    out.write(reinterpret_cast<const char *>(&count), 4);
    out.write(reinterpret_cast<const char *>(&blob_len), 4);
    out.write(reinterpret_cast<const char *>(skeys.data()), (std::streamsize)count * 8);
    out.write(reinterpret_cast<const char *>(offs.data()), (std::streamsize)(count + 1) * 4);
    out.write(blob.data(), blob_len);
    out.close();

    py::dict r;
    r["records"] = count;
    r["read"] = total;
    r["duplicates"] = dupes;
    r["skipped"] = bad;
    r["bytes"] = (uint64_t)16 + (uint64_t)count * 8 + (uint64_t)(count + 1) * 4 + blob_len;
    return r;
}

// -----------------------------------------------------------------------------
// Index: mmap load + lookup
// -----------------------------------------------------------------------------

class Index {
  public:
    explicit Index(const std::string &path) {
        fd_ = ::open(path.c_str(), O_RDONLY);
        if (fd_ < 0) throw std::runtime_error("cannot open index: " + path);
        struct stat st{};
        if (fstat(fd_, &st) != 0) { ::close(fd_); throw std::runtime_error("fstat failed"); }
        size_ = (size_t)st.st_size;
        base_ = (const uint8_t *)mmap(nullptr, size_, PROT_READ, MAP_PRIVATE, fd_, 0);
        if (base_ == MAP_FAILED) { ::close(fd_); throw std::runtime_error("mmap failed"); }
        if (size_ < 16 || std::memcmp(base_, MAGIC, 8) != 0)
            throw std::runtime_error("bad index magic");
        std::memcpy(&count_, base_ + 8, 4);
        std::memcpy(&blob_len_, base_ + 12, 4);
        keys_ = reinterpret_cast<const uint64_t *>(base_ + 16);
        offs_ = reinterpret_cast<const uint32_t *>(base_ + 16 + (size_t)count_ * 8);
        blob_ = reinterpret_cast<const char *>(base_ + 16 + (size_t)count_ * 8 + (size_t)(count_ + 1) * 4);
        // Advise the kernel we'll hit the keys randomly; keeps them hot.
        madvise((void *)base_, size_, MADV_WILLNEED);
    }
    ~Index() {
        if (base_ && base_ != MAP_FAILED) munmap((void *)base_, size_);
        if (fd_ >= 0) ::close(fd_);
    }
    Index(const Index &) = delete;
    Index &operator=(const Index &) = delete;

    uint32_t size() const { return count_; }

    // Longest-prefix match. Returns the tab-joined record, or nullopt.
    std::optional<std::string> lookup(const std::string &pan) const {
        // Keep only leading digits.
        char digits[12];
        uint32_t n = 0;
        for (char c : pan) {
            if (c >= '0' && c <= '9') {
                if (n < 11) digits[n++] = c;
                else { n = 12; break; }  // 12 = "too long, still ok, use first 11"
            }
        }
        uint32_t usable = n > 11 ? 11 : n;
        if (usable < 6) return std::nullopt;

        // Try longest prefix first.
        for (uint32_t len = usable; len >= 6; --len) {
            uint64_t pv = 0;
            for (uint32_t i = 0; i < len; ++i) pv = pv * 10 + (uint64_t)(digits[i] - '0');
            uint64_t key = pack_key(pv, len);
            // Binary search over sorted keys_.
            uint32_t lo = 0, hi = count_;
            while (lo < hi) {
                uint32_t mid = lo + ((hi - lo) >> 1);
                uint64_t k = keys_[mid];
                if (k < key) lo = mid + 1;
                else if (k > key) hi = mid;
                else {
                    uint32_t s = offs_[mid], e = offs_[mid + 1];
                    return std::string(blob_ + s, e - s);
                }
            }
        }
        return std::nullopt;
    }

  private:
    int fd_ = -1;
    size_t size_ = 0;
    const uint8_t *base_ = nullptr;
    uint32_t count_ = 0;
    uint32_t blob_len_ = 0;
    const uint64_t *keys_ = nullptr;
    const uint32_t *offs_ = nullptr;
    const char *blob_ = nullptr;
};

PYBIND11_MODULE(binlookup, m) {
    m.doc() = "VeriSec BIN lookup engine (mmap + binary-search longest-prefix match)";
    m.def("build", &build_index, py::arg("csv_path"), py::arg("out_path"),
          "Build a .binidx from a normalized CSV (col 0 = prefix, first row = header, first dup wins).");
    py::class_<Index>(m, "Index")
        .def(py::init<const std::string &>(), py::arg("path"))
        .def("lookup", &Index::lookup, py::arg("pan"),
             "Longest-prefix lookup; returns the tab-joined record or None.")
        .def_property_readonly("size", &Index::size);
}
