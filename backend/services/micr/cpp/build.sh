#!/usr/bin/env bash
# Build the cheque normaliser: the shared library the backend loads in-process, and a
# CLI for testing/benchmarks. Needs g++ and OpenCV 4 (libopencv-dev). Only the three
# OpenCV modules actually used are linked, so the library loads fast.
set -euo pipefail
cd "$(dirname "$0")"
CXXFLAGS="-O3 -march=x86-64-v3 -std=c++17 -Wall -Wextra $(pkg-config --cflags opencv4)"
LIBS="-lopencv_imgcodecs -lopencv_imgproc -lopencv_core"
g++ $CXXFLAGS -fPIC -shared -o libchequeprep.so chequeprep.cpp $LIBS
g++ $CXXFLAGS -DCHEQUEPREP_CLI -o chequeprep chequeprep.cpp $LIBS
echo "built: $(pwd)/libchequeprep.so and $(pwd)/chequeprep"
