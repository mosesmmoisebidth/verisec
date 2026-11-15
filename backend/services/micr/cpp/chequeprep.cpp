// Cheque image normalisation for the vision model, in C++ (OpenCV 4 core/imgproc/imgcodecs).
//
// Every photo becomes the same flat, fixed-size, evenly lit image before the model sees
// it, which removes most of the variation that changes the model's reading. The order
// of the steps matters:
//   1. Orientation: apply the EXIF rotation phones store in metadata, before anything else.
//   2. Corners: find the document's four corners and warp it flat onto a fixed canvas.
//      That removes zoom, position, tilt and background in one move. A scan or a tight
//      crop has no background edge to find; if the whole frame already has a cheque's
//      proportions it is used as the document instead of being rejected.
//   3. Quality gates: too far away, blurry or glare. No processing can repair those.
//   4. Lighting: gentle, measured on the flattened document only (not the table behind
//      it): the ink level (1st percentile of Lab L) and the paper level (median) are
//      pinned to fixed targets, which also holds when the paper is clipped to white.
//      CLAHE is available but off by default: measured, it made variants of the same
//      cheque 2-3x less alike.
//   5. Output: fixed-size JPEG at quality 95 by default (deterministic: the same input
//      always gives the same bytes; ~4 ms and ~1/3 the size of PNG, which matters more
//      for the upload to the GPU than the encode). Lossless PNG is one setting away.
// Deliberately NO binarisation and NO heavy sharpening: the model was trained on
// natural colour photos and reads over-processed images worse.
//
// Built two ways from this one file:
//   libchequeprep.so  C ABI (cp_preprocess / cp_free), called in-process from Python.
//   chequeprep        CLI for testing and benchmarking (-DCHEQUEPREP_CLI).
// See build.sh.

#include <opencv2/core.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>


namespace {

using Clock = std::chrono::steady_clock;

double ms_since(Clock::time_point t) {
    return std::chrono::duration<double, std::milli>(Clock::now() - t).count();
}

enum Status { OK = 0, NOT_FOUND = 1, TOO_FAR = 2, BLURRY = 3, GLARE = 4, DECODE_ERROR = 5 };

const char *status_name(int s) {
    switch (s) {
        case OK: return "ok";
        case NOT_FOUND: return "document not found";
        case TOO_FAR: return "too far away";
        case BLURRY: return "blurry";
        case GLARE: return "glare";
        default: return "unreadable image";
    }
}

// ---------------------------------------------------------------------------------------
// Container parsing: EXIF orientation and pixel size, read straight from the bytes.
// ---------------------------------------------------------------------------------------

// EXIF Orientation tag (0x0112) of a JPEG, 1 if absent or unreadable.
int jpeg_exif_orientation(const uint8_t *d, size_t n) {
    if (n < 4 || d[0] != 0xFF || d[1] != 0xD8) return 1;
    size_t i = 2;
    while (i + 4 <= n) {
        if (d[i] != 0xFF) return 1;
        const uint8_t marker = d[i + 1];
        if (marker == 0xFF) { ++i; continue; }               // fill byte
        if (marker == 0xD9 || marker == 0xDA) return 1;      // EOI / start of scan
        const size_t len = (size_t(d[i + 2]) << 8) | d[i + 3];
        if (len < 2 || i + 2 + len > n) return 1;
        if (marker == 0xE1 && len >= 16 && std::memcmp(d + i + 4, "Exif\0\0", 6) == 0) {
            const uint8_t *t = d + i + 10;
            const size_t tn = len - 8;
            const bool le = t[0] == 'I' && t[1] == 'I';
            auto u16 = [&](size_t o) -> uint32_t {
                if (o + 2 > tn) return 0;
                return le ? uint32_t(t[o] | t[o + 1] << 8) : uint32_t(t[o] << 8 | t[o + 1]);
            };
            auto u32 = [&](size_t o) -> uint32_t {
                if (o + 4 > tn) return 0;
                return le ? uint32_t(t[o]) | uint32_t(t[o + 1]) << 8 | uint32_t(t[o + 2]) << 16 | uint32_t(t[o + 3]) << 24
                          : uint32_t(t[o]) << 24 | uint32_t(t[o + 1]) << 16 | uint32_t(t[o + 2]) << 8 | uint32_t(t[o + 3]);
            };
            const size_t ifd = u32(4);
            const uint32_t count = u16(ifd);
            for (uint32_t k = 0; k < count; ++k) {
                const size_t e = ifd + 2 + 12 * size_t(k);
                if (e + 12 > tn) break;
                if (u16(e) == 0x0112) {
                    const uint32_t v = u16(e + 8);
                    return (v >= 1 && v <= 8) ? int(v) : 1;
                }
            }
            return 1;
        }
        i += 2 + len;
    }
    return 1;
}

// Pixel size from the JPEG SOF or PNG IHDR header, without decoding. false if unknown.
bool header_size(const uint8_t *d, size_t n, int &w, int &h) {
    if (n >= 24 && std::memcmp(d, "\x89PNG\r\n\x1a\n", 8) == 0) {
        w = int(uint32_t(d[16]) << 24 | uint32_t(d[17]) << 16 | uint32_t(d[18]) << 8 | d[19]);
        h = int(uint32_t(d[20]) << 24 | uint32_t(d[21]) << 16 | uint32_t(d[22]) << 8 | d[23]);
        return w > 0 && h > 0;
    }
    if (n < 4 || d[0] != 0xFF || d[1] != 0xD8) return false;
    size_t i = 2;
    while (i + 4 <= n) {
        if (d[i] != 0xFF) return false;
        const uint8_t m = d[i + 1];
        if (m == 0xFF) { ++i; continue; }
        if (m == 0xD9 || m == 0xDA) return false;
        const size_t len = (size_t(d[i + 2]) << 8) | d[i + 3];
        if (len < 2 || i + 2 + len > n) return false;
        const bool sof = (m >= 0xC0 && m <= 0xCF) && m != 0xC4 && m != 0xC8 && m != 0xCC;
        if (sof && len >= 7) {
            h = int(d[i + 5]) << 8 | d[i + 6];
            w = int(d[i + 7]) << 8 | d[i + 8];
            return w > 0 && h > 0;
        }
        i += 2 + len;
    }
    return false;
}

// Same mapping as PIL's ImageOps.exif_transpose.
void apply_orientation(cv::Mat &m, int o) {
    switch (o) {
        case 2: cv::flip(m, m, 1); break;
        case 3: cv::rotate(m, m, cv::ROTATE_180); break;
        case 4: cv::flip(m, m, 0); break;
        case 5: cv::transpose(m, m); break;
        case 6: cv::rotate(m, m, cv::ROTATE_90_CLOCKWISE); break;
        case 7: cv::transpose(m, m); cv::flip(m, m, -1); break;
        case 8: cv::rotate(m, m, cv::ROTATE_90_COUNTERCLOCKWISE); break;
        default: break;
    }
}

// ---------------------------------------------------------------------------------------
// Corners
// ---------------------------------------------------------------------------------------

// Order 4 points as top-left, top-right, bottom-right, bottom-left (by x+y and y-x).
std::array<cv::Point2f, 4> order_corners(const std::vector<cv::Point2f> &p) {
    auto s = [](const cv::Point2f &q) { return q.x + q.y; };
    auto d = [](const cv::Point2f &q) { return q.y - q.x; };
    std::array<cv::Point2f, 4> o;
    o[0] = *std::min_element(p.begin(), p.end(), [&](auto &a, auto &b) { return s(a) < s(b); });
    o[2] = *std::max_element(p.begin(), p.end(), [&](auto &a, auto &b) { return s(a) < s(b); });
    o[1] = *std::min_element(p.begin(), p.end(), [&](auto &a, auto &b) { return d(a) < d(b); });
    o[3] = *std::max_element(p.begin(), p.end(), [&](auto &a, auto &b) { return d(a) < d(b); });
    return o;
}

// Intersection of two lines given as (vx, vy, x0, y0), the form cv::fitLine returns.
bool intersect(const cv::Vec4f &a, const cv::Vec4f &b, cv::Point2f &p) {
    const double den = double(a[0]) * b[1] - double(a[1]) * b[0];
    if (std::abs(den) < 1e-6) return false;
    const double t = ((double(b[2]) - a[2]) * b[1] - (double(b[3]) - a[3]) * b[0]) / den;
    p = cv::Point2f(float(a[2] + t * a[0]), float(a[3] + t * a[1]));
    return true;
}

// Sub-pixel corners: fit a straight line (robust Huber fit) through ALL contour points
// along each side, skipping the rounded or occluded zones near the corners, then
// intersect adjacent sides. Hundreds of points per side average away pixel noise, so
// the corners stay put when the photo is slightly noisier, blurrier, cropped or
// rotated; a polygon vertex (a single contour point) jumps by pixels, which shifts the
// whole flattened image. false (keep the coarse corners) if a side is too thin to fit
// or the refinement wanders away from the coarse corner.
bool refine_corners(const std::vector<cv::Point> &contour, std::array<cv::Point2f, 4> &q) {
    std::array<std::vector<cv::Point2f>, 4> side;
    for (const auto &c : contour) {
        const cv::Point2f pt(float(c.x), float(c.y));
        int best = -1;
        double best_d = 1e18;
        for (int i = 0; i < 4; ++i) {
            const cv::Point2f a = q[i], ab = q[(i + 1) % 4] - q[i];
            const double len2 = ab.dot(ab);
            if (len2 < 1) continue;
            const double t = (pt - a).dot(ab) / len2;
            if (t < 0.1 || t > 0.9) continue;
            const double d = cv::norm(pt - (a + ab * float(t)));
            if (d < best_d) { best_d = d; best = i; }
        }
        if (best >= 0 && best_d < 6.0) side[best].push_back(pt);
    }
    std::array<cv::Vec4f, 4> line;
    for (int i = 0; i < 4; ++i) {
        if (side[i].size() < 20) return false;
        cv::fitLine(side[i], line[i], cv::DIST_HUBER, 0, 0.01, 0.01);
    }
    std::array<cv::Point2f, 4> r;
    for (int i = 0; i < 4; ++i) {
        // corner i joins side i-1 (corner i-1 -> i) and side i (corner i -> i+1)
        if (!intersect(line[(i + 3) % 4], line[i], r[i]) || cv::norm(r[i] - q[i]) > 10.0) return false;
    }
    q = r;
    return true;
}

// The document's corners in `img` pixels, found on an 800px copy. false if no quad.
bool find_corners(const cv::Mat &img, std::array<cv::Point2f, 4> &out, bool &refined) {
    const double scale = 800.0 / std::max(img.cols, img.rows);
    cv::Mat small, gray, edges;
    cv::resize(img, small, cv::Size(), scale, scale, cv::INTER_AREA);
    cv::cvtColor(small, gray, cv::COLOR_BGR2GRAY);
    cv::GaussianBlur(gray, gray, cv::Size(5, 5), 0);
    cv::Canny(gray, edges, 50, 150);
    cv::dilate(edges, edges, cv::Mat::ones(3, 3, CV_8U));
    std::vector<std::vector<cv::Point>> contours;
    cv::findContours(edges, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_NONE);  // every point, for the line fits
    std::sort(contours.begin(), contours.end(),
              [](auto &a, auto &b) { return cv::contourArea(a) > cv::contourArea(b); });
    const double min_area = 0.2 * small.cols * small.rows;
    for (size_t k = 0; k < std::min<size_t>(5, contours.size()); ++k) {
        std::vector<cv::Point> quad;
        cv::approxPolyDP(contours[k], quad, 0.02 * cv::arcLength(contours[k], true), true);
        if (quad.size() == 4 && cv::contourArea(quad) > min_area) {
            std::vector<cv::Point2f> pts(quad.begin(), quad.end());
            std::array<cv::Point2f, 4> q = order_corners(pts);
            refined = refine_corners(contours[k], q);
            for (int i = 0; i < 4; ++i) out[i] = q[i] * float(1.0 / scale);
            return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------------------

// Lighting: pin the INK level (1st percentile of L) and the PAPER level (median of L;
// most of a cheque is paper) to fixed targets, so the same document comes out at the
// same brightness however it was lit or exposed. Unlike a 1st-99th percentile stretch
// this holds when the paper is clipped to white (the 99th percentile is then just 255
// and says nothing about the document). Then an optional mild CLAHE evens out shadows.
void fix_lighting(cv::Mat &bgr, double clahe_clip) {
    cv::Mat lab;
    cv::cvtColor(bgr, lab, cv::COLOR_BGR2Lab);
    std::vector<cv::Mat> ch;
    cv::split(lab, ch);
    int hist[256] = {0};
    for (int y = 0; y < ch[0].rows; ++y) {
        const uint8_t *r = ch[0].ptr<uint8_t>(y);
        for (int x = 0; x < ch[0].cols; ++x) ++hist[r[x]];
    }
    const double total = double(ch[0].total());
    int ink = 0, paper = 0;
    for (double acc = 0; ink < 255 && (acc += hist[ink]) < 0.01 * total;) ++ink;
    for (double acc = 0; paper < 255 && (acc += hist[paper]) < 0.5 * total;) ++paper;
    const double ink_target = 25.0, paper_target = 225.0;   // 8-bit Lab L
    const double gain = std::clamp((paper_target - ink_target) / std::max(paper - ink, 1), 0.5, 3.0);
    cv::Mat lut(1, 256, CV_8U);
    for (int v = 0; v < 256; ++v)
        lut.at<uint8_t>(v) = cv::saturate_cast<uint8_t>((v - ink) * gain + ink_target);
    cv::LUT(ch[0], lut, ch[0]);
    if (clahe_clip > 0) cv::createCLAHE(clahe_clip, cv::Size(8, 8))->apply(ch[0], ch[0]);
    cv::merge(ch, lab);
    cv::cvtColor(lab, bgr, cv::COLOR_Lab2BGR);
}

struct Params {
    int out_w = 1120, out_h = 672;
    double min_doc_frac = 0.6;     // document's top edge must be >= this * out_w pixels
    double blur_min_var = 100.0;   // Laplacian variance below this = blurry
    double glare_max_frac = 0.05;  // share of near-white (>250) pixels above this = glare
    int white_paper_level = 240;   // paper median at/above this = a white scan: no glare check
    double frame_min_aspect = 1.3; // a doc-less frame with this..max aspect = the document
    double frame_max_aspect = 3.2;
    int frame_min_paper = 120;     // ...and only if it actually looks like paper (median grey)
    double clahe_clip = 0.0;       // CLAHE after the lighting pin; 0 = off (measured: off keeps
                                   // variants of the same cheque 2-3x more alike than 1.5)
    int png_level = 1;             // zlib level: 1 = fast, still lossless
    int png_strategy = 0;          // 0 default, 1 filtered, 2 huffman-only, 3 RLE, 4 fixed
    int jpeg_quality = 95;         // > 0: JPEG at this quality (default); 0: lossless PNG
    bool keep_on_reject = false;   // still produce the image when a quality gate fails
};

struct Result {
    int status = DECODE_ERROR;
    std::vector<uint8_t> png;
    std::string method = "none";
    bool corners_refined = false;
    std::array<cv::Point2f, 4> corners{};
    int exif_orientation = 1, reduction = 1, in_w = 0, in_h = 0;
    double doc_top_px = 0, blur_var = 0, glare_frac = 0;
    int paper_level = 0;
    bool glare_checked = false;
    double ms_decode = 0, ms_corners = 0, ms_warp = 0, ms_checks = 0, ms_light = 0, ms_encode = 0, ms_total = 0;
};

Result run(const uint8_t *data, size_t len, const Params &p) {
    Result r;
    const auto t0 = Clock::now();

    // 1. Decode + orientation. A photo far larger than the canvas is decoded at 1/2, 1/4
    //    or 1/8 size straight from the JPEG data (nearly free), keeping >= 1.6x the
    //    canvas width so the document still has more pixels than it needs.
    int hw = 0, hh = 0;
    int flags = cv::IMREAD_COLOR | cv::IMREAD_IGNORE_ORIENTATION;
    if (header_size(data, len, hw, hh)) {
        r.in_w = hw;
        r.in_h = hh;
        const int longest = std::max(hw, hh);
        for (int red : {8, 4, 2}) {
            if (longest / red >= 1.6 * p.out_w) { r.reduction = red; break; }
        }
        if (r.reduction == 2) flags = cv::IMREAD_REDUCED_COLOR_2 | cv::IMREAD_IGNORE_ORIENTATION;
        if (r.reduction == 4) flags = cv::IMREAD_REDUCED_COLOR_4 | cv::IMREAD_IGNORE_ORIENTATION;
        if (r.reduction == 8) flags = cv::IMREAD_REDUCED_COLOR_8 | cv::IMREAD_IGNORE_ORIENTATION;
    }
    cv::Mat img = cv::imdecode(cv::Mat(1, int(len), CV_8U, const_cast<uint8_t *>(data)), flags);
    if (img.empty()) { r.ms_total = ms_since(t0); return r; }
    if (r.in_w == 0) { r.in_w = img.cols; r.in_h = img.rows; }
    r.exif_orientation = jpeg_exif_orientation(data, len);
    apply_orientation(img, r.exif_orientation);
    r.ms_decode = ms_since(t0);

    // 2. Corners, or the whole frame for a scan / tight crop with a cheque's proportions.
    auto t = Clock::now();
    std::array<cv::Point2f, 4> c;
    if (find_corners(img, c, r.corners_refined)) {
        r.method = "corners";
    } else {
        // Whole frame = the document only if it has a cheque's proportions AND looks like
        // paper. A table photo with a small, unfound cheque is 4:3 too, but mostly dark.
        const double aspect = double(std::max(img.cols, img.rows)) / std::min(img.cols, img.rows);
        cv::Mat thumb;
        cv::resize(img, thumb, cv::Size(160, std::max(1, 160 * img.rows / img.cols)), 0, 0, cv::INTER_AREA);
        cv::cvtColor(thumb, thumb, cv::COLOR_BGR2GRAY);
        std::vector<uint8_t> px(thumb.begin<uint8_t>(), thumb.end<uint8_t>());
        std::nth_element(px.begin(), px.begin() + px.size() / 2, px.end());
        const int frame_paper = px[px.size() / 2];
        if (aspect < p.frame_min_aspect || aspect > p.frame_max_aspect || frame_paper < p.frame_min_paper) {
            r.status = NOT_FOUND;
            r.ms_corners = ms_since(t);
            r.ms_total = ms_since(t0);
            return r;
        }
        const float W = float(img.cols), H = float(img.rows);
        c = {cv::Point2f(0, 0), cv::Point2f(W, 0), cv::Point2f(W, H), cv::Point2f(0, H)};
        r.method = "full_frame";
    }
    double top = cv::norm(c[1] - c[0]), left = cv::norm(c[3] - c[0]);
    if (left > top) {                                    // photo taken sideways
        c = {c[1], c[2], c[3], c[0]};
        top = left;
    }
    r.corners = c;
    r.doc_top_px = top * r.reduction;                    // in original-photo pixels
    r.ms_corners = ms_since(t);

    // 3. Warp flat onto the fixed canvas.
    t = Clock::now();
    const cv::Point2f dst[4] = {{0, 0}, {float(p.out_w), 0}, {float(p.out_w), float(p.out_h)}, {0, float(p.out_h)}};
    cv::Mat M = cv::getPerspectiveTransform(c.data(), dst);
    cv::Mat flat;
    cv::warpPerspective(img, flat, M, cv::Size(p.out_w, p.out_h), cv::INTER_CUBIC, cv::BORDER_REPLICATE);
    r.ms_warp = ms_since(t);

    // 4. Quality gates on the flattened document.
    t = Clock::now();
    cv::Mat gray, lap;
    cv::cvtColor(flat, gray, cv::COLOR_BGR2GRAY);
    cv::Laplacian(gray, lap, CV_16S);                    // integer Laplacian: same variance, faster
    cv::Scalar mean, stddev;
    cv::meanStdDev(lap, mean, stddev);
    r.blur_var = stddev[0] * stddev[0];
    // Glare: share of near-white (>250) pixels. On a near-white scan the paper itself is
    // that bright, so glare cannot be told apart from paper there and the check is skipped
    // (it would otherwise reject every clean scan). Photographed paper sits well below.
    int ghist[256] = {0};
    for (int y = 0; y < gray.rows; ++y) {
        const uint8_t *row = gray.ptr<uint8_t>(y);
        for (int x = 0; x < gray.cols; ++x) ++ghist[row[x]];
    }
    for (double acc = 0, half = 0.5 * double(gray.total()); r.paper_level < 255 && (acc += ghist[r.paper_level]) < half;)
        ++r.paper_level;
    int bright = 0;
    for (int v = 251; v < 256; ++v) bright += ghist[v];
    r.glare_frac = double(bright) / double(gray.total());
    r.glare_checked = r.paper_level < p.white_paper_level;
    int gate = OK;
    if (r.doc_top_px < p.min_doc_frac * p.out_w) gate = TOO_FAR;
    else if (r.blur_var < p.blur_min_var) gate = BLURRY;
    else if (r.glare_checked && r.glare_frac > p.glare_max_frac) gate = GLARE;
    r.ms_checks = ms_since(t);
    if (gate != OK && !p.keep_on_reject) {
        r.status = gate;
        r.ms_total = ms_since(t0);
        return r;
    }

    // 5. Lighting, then lossless PNG.
    t = Clock::now();
    fix_lighting(flat, p.clahe_clip);
    r.ms_light = ms_since(t);
    t = Clock::now();
    if (p.jpeg_quality > 0)
        cv::imencode(".jpg", flat, r.png, {cv::IMWRITE_JPEG_QUALITY, p.jpeg_quality});
    else
        cv::imencode(".png", flat, r.png, {cv::IMWRITE_PNG_COMPRESSION, p.png_level,
                                           cv::IMWRITE_PNG_STRATEGY, p.png_strategy});
    r.ms_encode = ms_since(t);
    r.status = gate;
    r.ms_total = ms_since(t0);
    return r;
}

std::string meta_json(const Result &r) {
    char buf[1536];
    std::snprintf(buf, sizeof buf,
                  "{\"status\":%d,\"reason\":\"%s\",\"method\":\"%s\",\"refined\":%s,\"exif_orientation\":%d,"
                  "\"input\":[%d,%d],\"decode_reduction\":%d,"
                  "\"corners\":[[%.1f,%.1f],[%.1f,%.1f],[%.1f,%.1f],[%.1f,%.1f]],"
                  "\"doc_top_px\":%.1f,\"blur_var\":%.1f,\"glare_frac\":%.4f,\"glare_checked\":%s,\"paper_level\":%d,\"png_bytes\":%zu,"
                  "\"ms\":{\"decode\":%.2f,\"corners\":%.2f,\"warp\":%.2f,\"checks\":%.2f,"
                  "\"lighting\":%.2f,\"encode\":%.2f,\"total\":%.2f}}",
                  r.status, status_name(r.status), r.method.c_str(), r.corners_refined ? "true" : "false", r.exif_orientation, r.in_w, r.in_h,
                  r.reduction, r.corners[0].x, r.corners[0].y, r.corners[1].x, r.corners[1].y, r.corners[2].x,
                  r.corners[2].y, r.corners[3].x, r.corners[3].y, r.doc_top_px, r.blur_var, r.glare_frac,
                  r.glare_checked ? "true" : "false", r.paper_level, r.png.size(), r.ms_decode, r.ms_corners, r.ms_warp, r.ms_checks, r.ms_light, r.ms_encode,
                  r.ms_total);
    return buf;
}

}  // namespace

// ---------------------------------------------------------------------------------------
// C ABI for in-process use (ctypes). Returns the status code; on success *png points to
// malloc'ed image bytes (JPEG, or PNG when jpeg_quality is 0) that the caller releases
// with cp_free. meta gets a JSON summary.
// ---------------------------------------------------------------------------------------
extern "C" {

int cp_preprocess(const uint8_t *data, size_t len, int out_w, int out_h, double min_doc_frac,
                  double blur_min_var, double glare_max_frac, int png_level, int jpeg_quality, int keep_on_reject,
                  uint8_t **png, size_t *png_len, char *meta, size_t meta_cap) {
    Params p;
    p.out_w = out_w;
    p.out_h = out_h;
    p.min_doc_frac = min_doc_frac;
    p.blur_min_var = blur_min_var;
    p.glare_max_frac = glare_max_frac;
    p.png_level = png_level;
    p.jpeg_quality = jpeg_quality;
    p.keep_on_reject = keep_on_reject != 0;
    Result r;
    try {
        r = run(data, len, p);
    } catch (const cv::Exception &) {
        r.status = DECODE_ERROR;
    }
    *png = nullptr;
    *png_len = 0;
    if (!r.png.empty()) {
        *png = static_cast<uint8_t *>(std::malloc(r.png.size()));
        if (*png) {
            std::memcpy(*png, r.png.data(), r.png.size());
            *png_len = r.png.size();
        }
    }
    if (meta && meta_cap) {
        const std::string j = meta_json(r);
        std::snprintf(meta, meta_cap, "%s", j.c_str());
    }
    return r.status;
}

void cp_free(uint8_t *p) { std::free(p); }

}  // extern "C"

// ---------------------------------------------------------------------------------------
// CLI: chequeprep <in> <out> [--bench N] [--keep] [--w W --h H] [--jpeg Q | --png [--png-level L]]
// ---------------------------------------------------------------------------------------
#ifdef CHEQUEPREP_CLI
int main(int argc, char **argv) {
    if (argc < 3) {
        std::fprintf(stderr, "usage: chequeprep <in> <out.png> [--bench N] [--keep] [--w W --h H]\n");
        return 2;
    }
    Params p;
    int bench = 0;
    for (int i = 3; i < argc; ++i) {
        if (!std::strcmp(argv[i], "--bench") && i + 1 < argc) bench = std::atoi(argv[++i]);
        else if (!std::strcmp(argv[i], "--keep")) p.keep_on_reject = true;
        else if (!std::strcmp(argv[i], "--w") && i + 1 < argc) p.out_w = std::atoi(argv[++i]);
        else if (!std::strcmp(argv[i], "--png-level") && i + 1 < argc) p.png_level = std::atoi(argv[++i]);
        else if (!std::strcmp(argv[i], "--png-strategy") && i + 1 < argc) p.png_strategy = std::atoi(argv[++i]);
        else if (!std::strcmp(argv[i], "--jpeg") && i + 1 < argc) p.jpeg_quality = std::atoi(argv[++i]);
        else if (!std::strcmp(argv[i], "--png")) p.jpeg_quality = 0;
        else if (!std::strcmp(argv[i], "--clahe") && i + 1 < argc) p.clahe_clip = std::atof(argv[++i]);
        else if (!std::strcmp(argv[i], "--h") && i + 1 < argc) p.out_h = std::atoi(argv[++i]);
    }
    FILE *f = std::fopen(argv[1], "rb");
    if (!f) { std::perror("open"); return 1; }
    std::vector<uint8_t> data;
    uint8_t chunk[1 << 16];
    for (size_t k; (k = std::fread(chunk, 1, sizeof chunk, f)) > 0;) data.insert(data.end(), chunk, chunk + k);
    std::fclose(f);

    Result r = run(data.data(), data.size(), p);
    if (bench > 0) {  // in-process repeats: per-stage medians, no process start or file I/O
        std::vector<double> tot, dec, cor, wrp, chk, lit, enc;
        for (int i = 0; i < bench; ++i) {
            Result b = run(data.data(), data.size(), p);
            tot.push_back(b.ms_total); dec.push_back(b.ms_decode); cor.push_back(b.ms_corners);
            wrp.push_back(b.ms_warp); chk.push_back(b.ms_checks); lit.push_back(b.ms_light); enc.push_back(b.ms_encode);
        }
        auto med = [](std::vector<double> v) { std::sort(v.begin(), v.end()); return v[v.size() / 2]; };
        std::printf("{\"bench_runs\":%d,\"median_ms\":{\"decode\":%.2f,\"corners\":%.2f,\"warp\":%.2f,\"checks\":%.2f,"
                    "\"lighting\":%.2f,\"encode\":%.2f,\"total\":%.2f}}\n",
                    bench, med(dec), med(cor), med(wrp), med(chk), med(lit), med(enc), med(tot));
    }
    std::printf("%s\n", meta_json(r).c_str());
    if (!r.png.empty()) {
        FILE *o = std::fopen(argv[2], "wb");
        if (o) { std::fwrite(r.png.data(), 1, r.png.size(), o); std::fclose(o); }
    }
    return r.status;
}
#endif
