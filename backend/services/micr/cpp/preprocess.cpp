// Fast, dependency-free cheque image preprocessing in pure C++ (header-only stb).
// Right-sizes the image for the vision model (upscales tiny scans so handwriting is
// legible, caps huge ones to keep it fast), then a light unsharp-mask + mild contrast
// so strokes are crisp WITHOUT over-processing (a VLM reads natural images best, so we
// do not binarize). Milliseconds per image.
//
//   preprocess <in.(jpg|png|...)> <out.jpg> [targetLongestSide=1400] [jpegQuality=92]
//
// Build: g++ -O2 -o preprocess preprocess.cpp
#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"
#define STB_IMAGE_RESIZE_IMPLEMENTATION
#include "stb_image_resize2.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <vector>

int main(int argc, char **argv) {
    if (argc < 3) {
        std::fprintf(stderr, "usage: preprocess <in> <out.jpg> [target=1400] [quality=92]\n");
        return 2;
    }
    const int target = argc > 3 ? std::atoi(argv[3]) : 1400;
    const int quality = argc > 4 ? std::atoi(argv[4]) : 92;

    int w, h, c;
    unsigned char *img = stbi_load(argv[1], &w, &h, &c, 3);  // force 3-channel RGB
    if (!img) { std::fprintf(stderr, "load failed: %s\n", stbi_failure_reason()); return 1; }

    // Scale the longest side to `target` (up for small scans, down for oversized).
    int longest = std::max(w, h);
    double scale = static_cast<double>(target) / longest;
    int nw = w, nh = h;
    const unsigned char *src = img;
    std::vector<unsigned char> resized;
    if (scale < 0.95 || scale > 1.05) {
        nw = std::max(1, static_cast<int>(std::lround(w * scale)));
        nh = std::max(1, static_cast<int>(std::lround(h * scale)));
        resized.resize(static_cast<size_t>(nw) * nh * 3);
        stbir_resize_uint8_srgb(img, w, h, 0, resized.data(), nw, nh, 0, STBIR_RGB);
        src = resized.data();
    }

    const size_t N = static_cast<size_t>(nw) * nh * 3;
    // 3x3 box blur (per channel) for the unsharp mask.
    std::vector<unsigned char> blur(N);
    auto at = [&](int x, int y, int ch) { return (static_cast<size_t>(y) * nw + x) * 3 + ch; };
    for (int y = 0; y < nh; ++y)
        for (int x = 0; x < nw; ++x)
            for (int ch = 0; ch < 3; ++ch) {
                int sum = 0, cnt = 0;
                for (int dy = -1; dy <= 1; ++dy)
                    for (int dx = -1; dx <= 1; ++dx) {
                        int xx = x + dx, yy = y + dy;
                        if (xx < 0 || yy < 0 || xx >= nw || yy >= nh) continue;
                        sum += src[at(xx, yy, ch)];
                        ++cnt;
                    }
                blur[at(x, y, ch)] = static_cast<unsigned char>(sum / cnt);
            }

    const double amount = 0.6;    // unsharp strength
    const double contrast = 1.08; // gentle contrast around mid-grey
    std::vector<unsigned char> out(N);
    for (size_t i = 0; i < N; ++i) {
        double o = src[i], b = blur[i];
        double sharp = o + amount * (o - b);
        double cv = (sharp - 128.0) * contrast + 128.0;
        int v = static_cast<int>(std::lround(cv));
        out[i] = static_cast<unsigned char>(std::min(255, std::max(0, v)));
    }

    int ok = stbi_write_jpg(argv[2], nw, nh, 3, out.data(), quality);
    stbi_image_free(img);
    if (!ok) { std::fprintf(stderr, "write failed\n"); return 1; }
    return 0;
}
