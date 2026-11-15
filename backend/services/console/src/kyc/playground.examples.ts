/**
 * One example response per API, in the API's own envelope. Face, Document and MRZ examples were captured from
 * real runs on government specimen documents (images shown as "<base64 image>", long lists cut to their first
 * entries). Contact & risk and proof of address show fictional values in exactly the shape the API returns.
 * Generated from scratchpad; regenerate rather than editing by hand.
 */

export const EXAMPLES: Record<string, unknown> = {
  "face.analyze": {
    "ok": true,
    "request_id": "req_802e9e4d308844948142",
    "latency_ms": 1659,
    "data": {
      "code": 0,
      "msg": "OK",
      "detectionTime": 0.472509805,
      "faces": [
        {
          "roi": [
            102,
            118,
            228,
            321
          ],
          "rotationAngle": 0.18005776727073947,
          "landmarks": [
            [
              157,
              256
            ],
            [
              272,
              254
            ],
            [
              214,
              310
            ],
            [
              174,
              375
            ],
            [
              256,
              374
            ]
          ],
          "crop": "<base64 image>",
          "attributes": [
            {
              "name": "Age",
              "value": [
                29,
                31
              ]
            },
            {
              "confidence": 1.0,
              "name": "EyeRight",
              "value": "open"
            },
            {
              "confidence": 1.0,
              "name": "EyeLeft",
              "value": "open"
            },
            {
              "confidence": 1.0,
              "name": "Mouth",
              "value": "closed"
            }
          ],
          "quality": {
            "checks": [
              {
                "groupId": 2,
                "name": "Yaw",
                "range": [
                  -5.0,
                  5.0
                ],
                "status": 1,
                "value": -0.9091355800628662
              },
              {
                "groupId": 3,
                "name": "BlurLevel",
                "range": [
                  0.0,
                  0.15000000596046448
                ],
                "status": 1,
                "value": 0.06612038612365723
              }
            ],
            "nonCompliant": [],
            "score": -1.0
          }
        }
      ],
      "elapsedTime": 1.568222918,
      "metadata": {
        "serverTime": "2026-10-05T05:34:49.015Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      },
      "tag": "req-1"
    },
    "warnings": [],
    "error": null
  },
  "face.detect": {
    "ok": true,
    "request_id": "req_d7227dc4bcc649eeab32",
    "latency_ms": 578,
    "data": {
      "code": 0,
      "msg": "OK",
      "faceCount": 1,
      "faces": [
        {
          "roi": [
            102,
            118,
            228,
            321
          ],
          "rotationAngle": 0.18005776727073947,
          "landmarks": [
            [
              157,
              256
            ],
            [
              272,
              254
            ],
            [
              214,
              310
            ],
            [
              174,
              375
            ],
            [
              256,
              374
            ]
          ]
        }
      ],
      "elapsedTime": 0.512770632,
      "metadata": {
        "serverTime": "2026-10-05T05:34:49.654Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.count": {
    "ok": true,
    "request_id": "req_7c565fdfe4564f889889",
    "latency_ms": 476,
    "data": {
      "code": 0,
      "msg": "OK",
      "faceCount": 1,
      "ok": true,
      "rule": "expected==1",
      "faces": [
        {
          "roi": [
            102,
            118,
            228,
            321
          ]
        }
      ],
      "elapsedTime": 0.45388238,
      "metadata": {
        "serverTime": "2026-10-05T05:34:50.151Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.attributes": {
    "ok": true,
    "request_id": "req_c976d867c0744bb3b4fa",
    "latency_ms": 1099,
    "data": {
      "code": 0,
      "msg": "OK",
      "faces": [
        {
          "roi": [
            102,
            118,
            228,
            321
          ],
          "attributes": [
            {
              "name": "Age",
              "value": [
                29,
                31
              ]
            },
            {
              "confidence": 1.0,
              "name": "EyeRight",
              "value": "open"
            },
            {
              "confidence": 1.0,
              "name": "EyeLeft",
              "value": "open"
            },
            {
              "confidence": 1.0,
              "name": "Mouth",
              "value": "closed"
            }
          ]
        }
      ],
      "elapsedTime": 1.041403888,
      "metadata": {
        "serverTime": "2026-10-05T05:34:51.240Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.ppe": {
    "ok": true,
    "request_id": "req_0b29ee0fe55141448905",
    "latency_ms": 1260,
    "data": {
      "code": 0,
      "msg": "OK",
      "faces": [
        {
          "roi": [
            102,
            118,
            228,
            321
          ],
          "MedicalMask": "no",
          "Glasses": "no",
          "HeadCovering": "no",
          "Headphones": "no"
        }
      ],
      "elapsedTime": 1.206900618,
      "metadata": {
        "serverTime": "2026-10-05T05:34:52.515Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.emotion": {
    "ok": true,
    "request_id": "req_a68bd69124ec47a89571",
    "latency_ms": 839,
    "data": {
      "code": 0,
      "msg": "OK",
      "faces": [
        {
          "roi": [
            102,
            118,
            228,
            321
          ],
          "emotion": "neutral",
          "confidence": 0.15330377221107483
        }
      ],
      "elapsedTime": 0.762051539,
      "metadata": {
        "serverTime": "2026-10-05T05:34:53.384Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.crop": {
    "ok": true,
    "request_id": "req_cc2bde5498af4e6a8e35",
    "latency_ms": 530,
    "data": {
      "code": 0,
      "msg": "OK",
      "crops": [
        {
          "roi": [
            102,
            118,
            228,
            321
          ],
          "rotationAngle": 0.18005776727073947,
          "crop": "<base64 image>"
        }
      ],
      "elapsedTime": 0.484468657,
      "metadata": {
        "serverTime": "2026-10-05T05:34:56.695Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.redact": {
    "ok": true,
    "request_id": "req_f8f85cb128b741558fe5",
    "latency_ms": 579,
    "data": {
      "code": 0,
      "msg": "OK",
      "faceCount": 1,
      "image": "<base64 image>",
      "boxes": [
        [
          102,
          118,
          228,
          321
        ]
      ],
      "elapsedTime": 0.484965448,
      "metadata": {
        "serverTime": "2026-10-05T05:34:57.264Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.match": {
    "ok": true,
    "request_id": "req_613585979c3240a9b3d1",
    "latency_ms": 1441,
    "data": {
      "ErrorCode": 0,
      "code": 0,
      "detections": [
        {
          "faces": [
            {
              "crop": "<base64 image>",
              "faceIndex": 0,
              "landmarks": [
                [
                  231,
                  318
                ],
                [
                  316,
                  328
                ],
                [
                  270,
                  361
                ],
                [
                  233,
                  403
                ],
                [
                  295,
                  410
                ]
              ],
              "roi": [
                182,
                241,
                173,
                220
              ],
              "rotationAngle": -6.859032212941655
            }
          ],
          "imageIndex": 0,
          "status": 0
        },
        {
          "faces": [
            {
              "crop": "<base64 image>",
              "faceIndex": 0,
              "landmarks": [
                [
                  979,
                  327
                ],
                [
                  1067,
                  318
                ],
                [
                  1025,
                  363
                ],
                [
                  1001,
                  409
                ],
                [
                  1066,
                  400
                ]
              ],
              "roi": [
                940,
                245,
                176,
                216
              ],
              "rotationAngle": 6.693138443756709
            }
          ],
          "imageIndex": 1,
          "status": 0
        }
      ],
      "elapsedTime": 1.354184331,
      "msg": "OK",
      "results": [
        {
          "first": 3,
          "firstFaceIndex": 0,
          "firstIndex": 0,
          "score": 0.23992152512073517,
          "second": 3,
          "secondFaceIndex": 0,
          "secondIndex": 1,
          "similarity": 0.9983906745910645
        }
      ],
      "metadata": {
        "serverTime": "2026-10-05T05:34:58.755Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.verify": {
    "ok": true,
    "request_id": "req_cd1d47ea5bf34b7aae6c",
    "latency_ms": 2362,
    "data": {
      "code": 0,
      "msg": "OK",
      "similarity": 0.9983906745910645,
      "score": 0.23992152512073517,
      "match": true,
      "threshold": 0.75,
      "compared": [
        {
          "image": "image1",
          "roi": [
            182,
            241,
            173,
            220
          ]
        },
        {
          "image": "image2",
          "roi": [
            940,
            245,
            176,
            216
          ]
        }
      ],
      "elapsedTime": 2.299846035,
      "metadata": {
        "serverTime": "2026-10-05T05:35:01.160Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.similarity": {
    "ok": true,
    "request_id": "req_84fff5b015e1404ba5cc",
    "latency_ms": 1394,
    "data": {
      "code": 0,
      "msg": "OK",
      "similarity": 0.002763261552900076,
      "score": 2.0924413204193115,
      "compared": [
        {
          "image": "image1",
          "roi": [
            182,
            241,
            173,
            220
          ]
        },
        {
          "image": "image2",
          "roi": [
            102,
            118,
            228,
            321
          ]
        }
      ],
      "elapsedTime": 1.308462705,
      "metadata": {
        "serverTime": "2026-10-05T05:35:08.693Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.search": {
    "ok": true,
    "request_id": "req_f7cc793770774b209ad5",
    "latency_ms": 4758,
    "data": {
      "code": 0,
      "msg": "OK",
      "matches": [
        {
          "id": "b",
          "similarity": 0.9983906745910645,
          "rank": 1
        }
      ],
      "best": {
        "id": "b",
        "similarity": 0.9983906745910645
      },
      "elapsedTime": 4.759,
      "metadata": {
        "serverTime": "2026-10-05T05:35:10.320Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [
      "gallery face 'c': Second image face not detected."
    ],
    "error": null
  },
  "face.dedupe": {
    "ok": true,
    "request_id": "req_60d9550d11bb4defb9c0",
    "latency_ms": 3046,
    "data": {
      "code": 0,
      "msg": "OK",
      "duplicate": true,
      "matchedId": "u2",
      "similarity": 0.9983906745910645,
      "elapsedTime": 3.046,
      "metadata": {
        "serverTime": "2026-10-05T05:35:14.914Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.watchlist": {
    "ok": true,
    "request_id": "req_9f8770f9789243b38e7d",
    "latency_ms": 2753,
    "data": {
      "code": 0,
      "msg": "OK",
      "hit": true,
      "entry": {
        "id": "w1",
        "label": "blocked",
        "similarity": 0.9983906745910645
      },
      "elapsedTime": 2.753,
      "metadata": {
        "serverTime": "2026-10-05T05:35:19.340Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.cluster": {
    "ok": true,
    "request_id": "req_b2b8a49b6eb94360a874",
    "latency_ms": 4301,
    "data": {
      "code": 0,
      "msg": "OK",
      "clusters": [
        [
          "1",
          "3"
        ],
        [
          "2"
        ]
      ],
      "pairs": [
        {
          "a": "1",
          "b": "3",
          "similarity": 0.9983906745910645
        },
        {
          "a": "1",
          "b": "2",
          "similarity": 0.002763261552900076
        },
        {
          "a": "2",
          "b": "3",
          "similarity": 0.0023473226465284824
        }
      ],
      "elapsedTime": 4.301,
      "metadata": {
        "serverTime": "2026-10-05T05:35:22.373Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.age": {
    "ok": true,
    "request_id": "req_76185051933d44baaa47",
    "latency_ms": 1425,
    "data": {
      "code": 0,
      "msg": "OK",
      "faces": [
        {
          "roi": [
            102,
            118,
            228,
            321
          ],
          "age": [
            29,
            31
          ],
          "ageMid": 30,
          "crop": "<base64 image>"
        }
      ],
      "elapsedTime": 1.364995716,
      "metadata": {
        "serverTime": "2026-10-05T05:35:25.112Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "age.verify": {
    "ok": true,
    "request_id": "req_4e2655f727c143dcbef3",
    "latency_ms": 1476,
    "data": {
      "code": 0,
      "msg": "OK",
      "age": [
        29,
        31
      ],
      "allowed": true,
      "minAge": 18,
      "basis": "lowerBound(29)>=18",
      "elapsedTime": 1.388019878,
      "metadata": {
        "serverTime": "2026-10-05T05:35:26.567Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "age.verify-live": {
    "ok": true,
    "request_id": "req_fd9a9fa7649d4f5fa11a",
    "latency_ms": 3992,
    "data": {
      "code": 0,
      "msg": "OK",
      "age": [
        29,
        31
      ],
      "allowed": false,
      "live": false,
      "basis": "lowerBound(29)>=21",
      "elapsedTime": 3.993,
      "metadata": {
        "serverTime": "2026-10-05T05:35:27.626Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "face.quality": {
    "ok": true,
    "request_id": "req_150622a436b04dd19022",
    "latency_ms": 1816,
    "data": {
      "code": 0,
      "msg": "OK",
      "compliant": true,
      "nonCompliant": [],
      "groups": [
        {
          "compliantCount": 5,
          "groupId": 1,
          "name": "ImageCharacteristics",
          "totalCount": 5
        },
        {
          "compliantCount": 8,
          "groupId": 2,
          "name": "HeadSizeAndPosition",
          "totalCount": 8
        },
        {
          "compliantCount": 4,
          "groupId": 3,
          "name": "FaceQuality",
          "totalCount": 4
        },
        {
          "compliantCount": 8,
          "groupId": 4,
          "name": "EyesCharacteristics",
          "totalCount": 8
        },
        {
          "compliantCount": 4,
          "groupId": 5,
          "name": "ShadowsAndLightning",
          "totalCount": 4
        },
        {
          "compliantCount": 4,
          "groupId": 6,
          "name": "PoseAndExpression",
          "totalCount": 4
        },
        {
          "compliantCount": 8,
          "groupId": 7,
          "name": "HeadOcclusion",
          "totalCount": 8
        },
        {
          "compliantCount": 3,
          "groupId": 8,
          "name": "Background",
          "totalCount": 3
        }
      ],
      "checks": [
        {
          "groupId": 1,
          "name": "ImageWidth",
          "range": [
            480.0,
            10000.0
          ],
          "status": 1,
          "value": 480.0
        },
        {
          "groupId": 1,
          "name": "ImageHeight",
          "range": [
            640.0,
            10000.0
          ],
          "status": 1,
          "value": 640.0
        },
        {
          "groupId": 1,
          "name": "ImageWidthToHeight",
          "range": [
            0.7400000095367432,
            0.800000011920929
          ],
          "status": 1,
          "value": 0.75
        },
        {
          "groupId": 1,
          "name": "ImageChannelsNumber",
          "range": [
            3.0,
            3.0
          ],
          "status": 1,
          "value": 3.0
        }
      ],
      "scenario": "QualityICAO",
      "crop": "<base64 image>",
      "elapsedTime": 1.768051338,
      "metadata": {
        "serverTime": "2026-10-05T05:35:32.429Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "photo.compliance": {
    "ok": true,
    "request_id": "req_a68179bfea99413fb2d4",
    "latency_ms": 1150,
    "data": {
      "code": 0,
      "msg": "OK",
      "compliant": true,
      "nonCompliant": [],
      "checks": [
        {
          "groupId": 1,
          "name": "ImageWidth",
          "range": [
            480.0,
            10000.0
          ],
          "status": 1,
          "value": 480.0
        },
        {
          "groupId": 1,
          "name": "ImageHeight",
          "range": [
            640.0,
            10000.0
          ],
          "status": 1,
          "value": 640.0
        },
        {
          "groupId": 1,
          "name": "ImageWidthToHeight",
          "range": [
            0.7400000095367432,
            0.800000011920929
          ],
          "status": 1,
          "value": 0.75
        },
        {
          "groupId": 1,
          "name": "ImageChannelsNumber",
          "range": [
            3.0,
            3.0
          ],
          "status": 1,
          "value": 3.0
        }
      ],
      "standard": "ICAO",
      "elapsedTime": 1.079265742,
      "metadata": {
        "serverTime": "2026-10-05T05:35:33.591Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "photo.policy": {
    "ok": true,
    "request_id": "req_2d9e88790fd247f2a93f",
    "latency_ms": 596,
    "data": {
      "code": 0,
      "msg": "OK",
      "pass": true,
      "failed": [],
      "checks": [
        {
          "name": "Yaw",
          "range": [
            -10.0,
            10.0
          ],
          "value": -0.9016010761260986,
          "status": 1
        },
        {
          "name": "BlurLevel",
          "range": [
            0.0,
            0.15000000596046448
          ],
          "value": 0.05496573448181152,
          "status": 1
        }
      ],
      "elapsedTime": 0.565639973,
      "metadata": {
        "serverTime": "2026-10-05T05:35:34.214Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "photo.gate": {
    "ok": true,
    "request_id": "req_3ba5164cc7ce4867acf8",
    "latency_ms": 774,
    "data": {
      "code": 0,
      "msg": "OK",
      "ok": true,
      "failed": [],
      "elapsedTime": 0.701326287,
      "metadata": {
        "serverTime": "2026-10-05T05:35:35.005Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "photo.autofix": {
    "ok": true,
    "request_id": "req_62735bd14fb144ef8a4f",
    "latency_ms": 828,
    "data": {
      "code": 0,
      "msg": "OK",
      "image": "<base64 image>",
      "aspect": "3:4",
      "elapsedTime": 0.705820283,
      "metadata": {
        "serverTime": "2026-10-05T05:35:35.761Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "photo.best-frame": {
    "ok": true,
    "request_id": "req_08beeb19f3bc46b09a8f",
    "latency_ms": 2427,
    "data": {
      "code": 0,
      "msg": "OK",
      "bestIndex": 1,
      "ranking": [
        {
          "index": 1,
          "compliant": true,
          "failedCount": 0
        },
        {
          "index": 0,
          "compliant": false,
          "failedCount": 11
        },
        {
          "index": 2,
          "compliant": false,
          "failedCount": null
        }
      ],
      "elapsedTime": 2.428,
      "metadata": {
        "serverTime": "2026-10-05T05:35:37.492Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "liveness": {
    "ok": true,
    "request_id": "req_de9a0ff4be064b4a940c",
    "latency_ms": 2323,
    "data": {
      "code": 244,
      "status": 1,
      "live": false,
      "tag": "bc6fd861-ce62-4a1b-bc27-d7830fca6438",
      "sessionId": "bc6fd861-ce62-4a1b-bc27-d7830fca6438",
      "transactionId": "9e00947e-b2aa-49d2-879d-16e476f8efc7",
      "metadata": {
        "elapsedTime": 2.224224916,
        "serverTime": "2026-10-05T05:35:41.299Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      },
      "age": [
        {
          "pred": 30
        }
      ]
    },
    "warnings": [],
    "error": null
  },
  "liveness.antispoof": {
    "ok": true,
    "request_id": "req_615d48c9ae85440fa804",
    "latency_ms": 1947,
    "data": {
      "code": 244,
      "live": false,
      "reason": "ART_MASK",
      "reasonCode": 244,
      "category": "presentation-attack",
      "elapsedTime": 1.86945563,
      "metadata": {
        "elapsedTime": 1.86945563,
        "serverTime": "2026-10-05T05:35:45.174Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "liveness.gate": {
    "ok": true,
    "request_id": "req_d64bff25bb9c4ef6ae08",
    "latency_ms": 2304,
    "data": {
      "code": 244,
      "pass": false,
      "status": 1,
      "elapsedTime": 2.23751486,
      "metadata": {
        "elapsedTime": 2.23751486,
        "serverTime": "2026-10-05T05:35:47.485Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "identity.verify": {
    "ok": true,
    "request_id": "req_fc01263073ba4975bd08",
    "latency_ms": 3876,
    "data": {
      "code": 0,
      "msg": "OK",
      "verified": false,
      "live": false,
      "qualityOk": false,
      "similarity": 0.9983906745910645,
      "steps": {
        "liveness": {
          "live": false,
          "status": 1,
          "reasonCode": 244
        },
        "quality": {
          "ok": false,
          "failed": [
            "BlurLevel"
          ],
          "checked": [
            "BlurLevel",
            "OffGaze"
          ]
        },
        "match": {
          "similarity": 0.9983906745910645,
          "score": 0.23992152512073517,
          "match": true,
          "threshold": 0.8
        }
      },
      "elapsedTime": 3.876,
      "metadata": {
        "serverTime": "2026-10-05T05:35:49.270Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "auth.login": {
    "ok": true,
    "request_id": "req_435e3880ed8749ab9f25",
    "latency_ms": 5955,
    "data": {
      "code": 0,
      "msg": "OK",
      "authenticated": false,
      "userId": null,
      "similarity": 0.9983906745910645,
      "live": false,
      "elapsedTime": 5.956,
      "metadata": {
        "serverTime": "2026-10-05T05:35:55.737Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "fraud.signup-check": {
    "ok": true,
    "request_id": "req_620d02ed48054f388f2c",
    "latency_ms": 6459,
    "data": {
      "code": 0,
      "msg": "OK",
      "allow": false,
      "reason": "duplicate",
      "matchedId": "u1",
      "live": false,
      "elapsedTime": 6.46,
      "metadata": {
        "serverTime": "2026-10-05T05:36:03.854Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "proctor.check": {
    "ok": true,
    "request_id": "req_5500b8375080404eb849",
    "latency_ms": 3782,
    "data": {
      "code": 0,
      "msg": "OK",
      "ok": false,
      "live": false,
      "faceCount": 1,
      "offGaze": 0.16723337769508362,
      "lookingAway": false,
      "maskWorn": false,
      "elapsedTime": 3.783,
      "metadata": {
        "serverTime": "2026-10-05T05:36:04.807Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "age-gate.checkout": {
    "ok": true,
    "request_id": "req_5555da2743524f36b13c",
    "latency_ms": 3266,
    "data": {
      "code": 0,
      "msg": "OK",
      "allowed": false,
      "age": [
        29,
        31
      ],
      "live": false,
      "elapsedTime": 3.266,
      "metadata": {
        "serverTime": "2026-10-05T05:36:08.655Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "kiosk.photo": {
    "ok": true,
    "request_id": "req_445569c7528c42a0985a",
    "latency_ms": 3228,
    "data": {
      "code": 0,
      "msg": "OK",
      "compliant": true,
      "nonCompliant": [],
      "fixedImage": "<base64 image>",
      "printReady": true,
      "elapsedTime": 3.229,
      "metadata": {
        "serverTime": "2026-10-05T05:36:12.536Z",
        "ctx": {
          "userIp": "203.0.113.7"
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "idv.classify": {
    "ok": true,
    "request_id": "req_62b56d3e2b9b454e9724",
    "latency_ms": 1506,
    "data": {
      "document_name": "Czech Republic - ePassport (2006)",
      "doc_type": "PASSPORT",
      "category": "Passport",
      "country": "CZE",
      "country_name": "Czech Republic",
      "state": null,
      "year": "2006",
      "size": "ID-3",
      "has_mrz": true,
      "has_chip": true,
      "deprecated": false,
      "confidence": 0.723872721195221
    },
    "warnings": [],
    "error": null
  },
  "idv.mrz": {
    "ok": true,
    "request_id": "req_594cea1a392d46ac8725",
    "latency_ms": 1164,
    "data": {
      "lines": [
        "P<CZESPECIMEN<<VZOR<<<<<<<<<<<<<<<<<<<<<<<<<",
        "99006000<8CZE1102299F16090641152291111<<<<24"
      ],
      "format": "TD3",
      "valid": false,
      "expired": true,
      "problems": [
        {
          "field": "birth_date",
          "issue": "not a real date"
        }
      ],
      "check_digits": {
        "doc_number": {
          "digit": "8",
          "ok": true
        },
        "birth_date": {
          "digit": "9",
          "ok": true
        },
        "expiry": {
          "digit": "4",
          "ok": true
        },
        "personal_number": {
          "digit": "2",
          "ok": true
        },
        "composite": {
          "digit": "4",
          "ok": true
        }
      },
      "print_quality": {
        "check_sums": "pass",
        "contrast": "not_checked",
        "doc_format": "not_checked",
        "mrz_format": "not_checked",
        "print_position": "not_checked",
        "stains": "not_checked",
        "symbols": "not_checked"
      },
      "parsed": {
        "Surname And Given Names": "SPECIMEN VZOR",
        "RemainderTerm": "0",
        "Date of Birth": "110229",
        "Given Names": "VZOR",
        "Surname": "SPECIMEN",
        "Date of Expiry": "2016-09-06",
        "Document Class Code": "P",
        "Issuing State Name": "Czech Republic",
        "Final Checkdigit": "4",
        "Optional Data CheckDigit": "2",
        "Optional Data": "1152291111",
        "Issuing State Code": "CZE",
        "Document Number": "99006000",
        "Document Number Checkdigit": "8",
        "Nationality Code": "CZE",
        "Date of Birth Checkdigit": "9",
        "Sex": "F",
        "Date of Expiry Checkdigit": "4",
        "Personal Number": "1152291111",
        "MRZ Type": "ID-3"
      }
    },
    "warnings": [],
    "error": null
  },
  "idv.portrait": {
    "ok": true,
    "request_id": "req_f6d88e9d8641426bad23",
    "latency_ms": 1165,
    "data": {
      "portrait_ref": "doc_Vb3Xq9LmT2rKw8Zp4nYc1sHd",
      "face_detected": true,
      "faces_on_document": 1,
      "face_confidence": 0.96,
      "portrait": "<base64 image>"
    },
    "warnings": [],
    "error": null
  },
  "idv.authenticity": {
    "ok": true,
    "request_id": "req_188d8bca755843808f92",
    "latency_ms": 1181,
    "data": {
      "overall": "fail",
      "failed": [
        "expiry",
        "mrz",
        "text"
      ],
      "summary": {
        "pass": 2,
        "fail": 3,
        "not_checked": 2
      },
      "checks": [
        {
          "name": "docType",
          "status": "pass"
        },
        {
          "name": "expiry",
          "status": "fail"
        },
        {
          "name": "imageQA",
          "status": "pass"
        },
        {
          "name": "mrz",
          "status": "fail"
        },
        {
          "name": "security",
          "status": "not_checked"
        },
        {
          "name": "text",
          "status": "fail"
        },
        {
          "name": "vds",
          "status": "not_checked"
        }
      ],
      "image_quality": {
        "focus": "pass",
        "glare": "pass",
        "portrait": "pass",
        "bounds": "pass",
        "perspective": "pass",
        "resolution": "pass"
      }
    },
    "warnings": [],
    "error": null
  },
  "idv.fields": {
    "ok": true,
    "request_id": "req_0a12c067aef84eabb429",
    "latency_ms": 1229,
    "data": {
      "date_format": "yyyy-MM-dd",
      "count": 31,
      "summary": {
        "pass": 13,
        "fail": 8,
        "not_checked": 10,
        "sources_disagree": 3
      },
      "fields": [
        {
          "type": 25,
          "label": "Surname And Given Names",
          "status": "fail",
          "sources": [
            "VISUAL"
          ],
          "sources_agree": "not_checked",
          "value_masked": "S••••••••••Ó"
        },
        {
          "type": 25,
          "label": "Surname And Given Names",
          "status": "fail",
          "sources": [
            "MRZ",
            "VISUAL"
          ],
          "sources_agree": "fail",
          "value_masked": "S••••••••••R"
        },
        {
          "type": 364,
          "label": "RemainderTerm",
          "status": "fail",
          "sources": [
            "MRZ",
            "VISUAL"
          ],
          "sources_agree": "pass",
          "value_masked": "•"
        },
        {
          "type": 8,
          "label": "Surname",
          "status": "fail",
          "sources": [
            "VISUAL"
          ],
          "sources_agree": "not_checked",
          "value_masked": "S••••••N"
        }
      ]
    },
    "warnings": [],
    "error": null
  },
  "idv.read": {
    "ok": true,
    "request_id": "req_ab957d053778450995a3",
    "latency_ms": 1215,
    "data": {
      "ok": true,
      "data": {
        "ContainerList": {
          "Count": 14,
          "List": [
            {
              "OneCandidate": {
                "AuthenticityNecessaryLights": 3224,
                "CheckAuthenticity": 6817327,
                "DocumentName": "Czech Republic - ePassport (2006)",
                "FDSIDList": {
                  "Count": 3,
                  "ICAOCode": "CZE",
                  "List": [
                    3244,
                    11569,
                    18726
                  ],
                  "dCountryName": "Czech Republic",
                  "dDescription": "Passport",
                  "dFormat": 2,
                  "dMRZ": true,
                  "dType": 11,
                  "dYear": "2006",
                  "isDeprecated": false
                },
                "ID": 824952191,
                "NecessaryLights": 25165824,
                "OVIExp": 5,
                "P": 0.723872721195221,
                "RFID_Presence": 1,
                "Rotated180": 0,
                "RotationAngle": 0,
                "UVExp": 6
              },
              "buf_length": 8,
              "light": 0,
              "list_idx": 0,
              "page_idx": 0,
              "result_type": 9
            },
            {
              "ImageQualityCheckList": {
                "Count": 6,
                "List": [
                  {
                    "featureType": 0,
                    "mean": -4.747840881347656,
                    "probability": 99,
                    "result": 1,
                    "std_dev": 4.747161865234375,
                    "type": 1
                  },
                  {
                    "featureType": 0,
                    "mean": 0.0,
                    "probability": 0,
                    "result": 1,
                    "std_dev": 0.0,
                    "type": 0
                  },
                  {
                    "featureType": 0,
                    "mean": 0.0,
                    "probability": 0,
                    "result": 1,
                    "std_dev": 0.0,
                    "type": 7
                  },
                  {
                    "featureType": 0,
                    "mean": 0.0,
                    "probability": 0,
                    "result": 1,
                    "std_dev": 0.0,
                    "type": 5
                  },
                  {
                    "featureType": 0,
                    "mean": 0.0,
                    "probability": 0,
                    "result": 1,
                    "std_dev": 0.0,
                    "type": 4
                  },
                  {
                    "featureType": 0,
                    "mean": 0.0,
                    "probability": 0,
                    "result": 1,
                    "std_dev": 0.0,
                    "type": 2
                  }
                ],
                "result": 1
              },
              "buf_length": 8,
              "light": 0,
              "list_idx": 0,
              "page_idx": 0,
              "result_type": 30
            },
            {
              "Status": {
                "detailsOptical": {
                  "docType": 1,
                  "expiry": 0,
                  "imageQA": 1,
                  "mrz": 0,
                  "overallStatus": 0,
                  "pagesCount": 1,
                  "security": 2,
                  "text": 0,
                  "vds": 2
                },
                "detailsRFID": {
                  "AA": 2,
                  "BAC": 2,
                  "CA": 2,
                  "PA": 2,
                  "PACE": 2,
                  "TA": 2,
                  "overallStatus": 2
                },
                "optical": 0,
                "overallStatus": 0,
                "portrait": 2,
                "rfid": 2,
                "stopList": 2
              },
              "buf_length": 84,
              "light": 0,
              "list_idx": 0,
              "page_idx": 0,
              "result_type": 33
            }
          ]
        },
        "TransactionInfo": {
          "DateTime": "2026-10-05T05:36:22.939Z",
          "Tag": "37e5e108-691a-445e-a03d-9a32e49a52d5",
          "TransactionID": "436d80f4-38de-42bd-86f3-056b84a1ad89"
        },
        "ProcessingFinished": 1
      },
      "doc_hint": {
        "country": "CZ",
        "type": "passport",
        "detected": {
          "country": "CZE",
          "category": "Passport"
        },
        "country_matches": true,
        "type_matches": true
      }
    },
    "warnings": [],
    "error": null
  },
  "mrz.read": {
    "ok": true,
    "request_id": "req_ac9bc6822e0b411bb600",
    "latency_ms": 401,
    "data": {
      "lines": [
        "P<CZESPECIMEN<<VZOR<<<<<<<<<<<<<<<<<<<<<<<<<",
        "99006000<8CZE1102299F16090641152291111<<<<24"
      ],
      "warped_box": [
        75,
        732,
        1286,
        732,
        1286,
        840,
        75,
        840
      ],
      "confidence": [
        92.0,
        91.0
      ],
      "format": "TD3",
      "valid": false,
      "expired": true,
      "problems": [
        {
          "field": "birth_date",
          "issue": "not a real date"
        }
      ],
      "parsed": {
        "doc": "P",
        "country": "CZE",
        "surname": "SPECIMEN",
        "given_name": "VZOR",
        "doc_number": "99006000",
        "nationality": "CZE",
        "birth_date": "110229",
        "sex": "F",
        "expiry": "160906",
        "personal_number": "1152291111",
        "check_digits": {
          "doc_number": {
            "digit": "8",
            "ok": true
          },
          "birth_date": {
            "digit": "9",
            "ok": true
          },
          "expiry": {
            "digit": "4",
            "ok": true
          },
          "personal_number": {
            "digit": "2",
            "ok": true
          },
          "composite": {
            "digit": "4",
            "ok": true
          }
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "mrz.recognize": {
    "ok": true,
    "request_id": "req_eae59ec4510742eaa67c",
    "latency_ms": 337,
    "data": {
      "lines": [
        "P<CZESPECIMEN<<VZOR<<<<<<<<<<<<<<<<<<<<<<<<<",
        "99006000<8CZE1102299F16090641152291111<<<<24"
      ],
      "warped_box": [
        75,
        732,
        1286,
        732,
        1286,
        840,
        75,
        840
      ],
      "confidence": [
        92.0,
        91.0
      ]
    },
    "warnings": [],
    "error": null
  },
  "mrz.parse": {
    "ok": true,
    "request_id": "req_d6db6dcaae924d908055",
    "latency_ms": 34,
    "data": {
      "format": "TD3",
      "valid": true,
      "expired": true,
      "problems": [],
      "parsed": {
        "doc": "P",
        "country": "UTO",
        "surname": "ERIKSSON",
        "given_name": "ANNA MARIA",
        "doc_number": "L898902C3",
        "nationality": "UTO",
        "birth_date": "740812",
        "sex": "F",
        "expiry": "120415",
        "personal_number": "ZE184226B",
        "check_digits": {
          "doc_number": {
            "digit": "6",
            "ok": true
          },
          "birth_date": {
            "digit": "2",
            "ok": true
          },
          "expiry": {
            "digit": "9",
            "ok": true
          },
          "personal_number": {
            "digit": "1",
            "ok": true
          },
          "composite": {
            "digit": "0",
            "ok": true
          }
        }
      }
    },
    "warnings": [],
    "error": null
  },
  "email.verify": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 1840,
    "data": {
      "email": "jane.doe@example.com",
      "domain": "example.com",
      "syntax_ok": true,
      "suggestion": null,
      "disposable": false,
      "free_provider": false,
      "mail_server": {
        "found": true,
        "hosts": [
          "mx1.example.com",
          "mx2.example.com"
        ]
      },
      "mailbox": "exists",
      "deliverable": "yes",
      "risk": {
        "level": "low",
        "reasons": []
      }
    },
    "warnings": [],
    "error": null
  },
  "email.footprint": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 41200,
    "data": {
      "email": "jane.doe@example.com",
      "count": 2,
      "accounts": [
        {
          "site": "example-social",
          "domain": "social.example.com",
          "recovery_email_hint": "j*****@e*****.com",
          "phone_hint": null
        },
        {
          "site": "example-shop",
          "domain": "shop.example.com",
          "recovery_email_hint": null,
          "phone_hint": "+25*******00"
        }
      ]
    },
    "warnings": [],
    "error": null
  },
  "osint.username": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 68400,
    "data": {
      "username": "jane_doe_88",
      "found": 2,
      "common": false,
      "profiles": [
        {
          "site": "GitHub",
          "url": "https://github.com/jane_doe_88"
        },
        {
          "site": "Example Forum",
          "url": "https://forum.example.com/u/jane_doe_88"
        }
      ],
      "left_out": 1
    },
    "warnings": [],
    "error": null
  },
  "phone.lookup": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 2310,
    "data": {
      "phone": "+250788000000",
      "valid": true,
      "format": {
        "e164": "+250788000000",
        "national": "0788 000 000",
        "international": "+250 788 000 000"
      },
      "country": {
        "code": "RW",
        "name": "Rwanda",
        "calling_code": "+250"
      },
      "location": null,
      "line": {
        "type": "mobile",
        "carrier": "Example Mobile",
        "mcc": "635",
        "mnc": "10"
      },
      "status": "active",
      "sms_pumping": {
        "score": 12,
        "carrier_risk": "low",
        "blocked": false,
        "blocked_on": null,
        "blocked_last_3_months": false
      },
      "sim_swap": {
        "available": false,
        "reason": "Not offered for numbers in this country."
      },
      "call_forwarding": {
        "available": false,
        "reason": "Not offered for numbers in this country."
      },
      "caller": {
        "available": false,
        "reason": "No data for this number."
      },
      "risk": {
        "level": "low",
        "reasons": []
      }
    },
    "warnings": [],
    "error": null
  },
  "phone.otp.send": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 910,
    "data": {
      "status": "pending",
      "to": "+250788000000",
      "channel": "sms"
    },
    "warnings": [],
    "error": null
  },
  "phone.otp.check": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 640,
    "data": {
      "status": "approved",
      "valid": true
    },
    "warnings": [],
    "error": null
  },
  "screen.ip": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 1260,
    "data": {
      "ip": "203.0.113.42",
      "version": 4,
      "location": {
        "continent": "EU",
        "country_code": "NL",
        "country": "Netherlands",
        "region": "North Holland",
        "city": "Amsterdam",
        "coordinates": {
          "lat": 52.374,
          "lon": 4.8897
        },
        "timezones": [
          "Europe/Amsterdam"
        ]
      },
      "network": {
        "asn": 64500,
        "organization": "Example Hosting B.V.",
        "connection_type": "datacenter",
        "isp": "Example Hosting B.V.",
        "operator": "Example VPN Ltd",
        "domain": "example-hosting.example",
        "hostnames": [
          "vpn-42.example-hosting.example"
        ],
        "mobile": false
      },
      "anonymity": {
        "tor": false,
        "vpn": true,
        "datacenter": true,
        "cloud_provider": null,
        "private_relay": false,
        "relay_region": null,
        "blocklisted": false,
        "proxy": false
      },
      "reputation": {
        "abuse_score": 0,
        "reports": 0,
        "distinct_reporters": 0,
        "last_reported": null,
        "usage": "Data Center/Web Hosting/Transit",
        "allowlisted": false
      },
      "risk": {
        "level": "medium",
        "reasons": [
          "A VPN address.",
          "A data centre or hosting address, not a home or mobile connection."
        ]
      }
    },
    "warnings": [],
    "error": null
  },
  "ip.analyze": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 24,
    "data": {
      "ip": "203.0.113.42",
      "version": 4,
      "private": false,
      "location": {
        "continent": "EU",
        "country_code": "NL",
        "country": "Netherlands",
        "region": "North Holland",
        "city": "Amsterdam",
        "coordinates": {
          "lat": 52.374,
          "lon": 4.8897
        },
        "timezones": [
          "Europe/Amsterdam"
        ]
      },
      "network": {
        "asn": 64500,
        "organization": "Example Hosting B.V.",
        "connection_type": "datacenter"
      },
      "anonymity": {
        "tor": false,
        "vpn": true,
        "datacenter": true,
        "cloud_provider": null,
        "private_relay": false,
        "relay_region": null,
        "blocklisted": false
      },
      "lists_updated": "2026-10-05T06:00:00Z"
    },
    "warnings": [],
    "error": null
  },
  "screen.sanctions": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 410,
    "data": {
      "query": {
        "name": "Jane Example",
        "type": "Person",
        "birth_date": "1980-04-12",
        "countries": [
          "xx"
        ],
        "id_numbers": []
      },
      "summary": {
        "results": 2,
        "matches": 1,
        "top_score": 0.93
      },
      "results": [
        {
          "id": "ent_2cea995ec08e7dbbb4e4",
          "name": "Jane EXAMPLE",
          "type": "Person",
          "score": 0.93,
          "match": true,
          "topics": [
            "Sanction"
          ],
          "lists": [
            "Example Sanctions List"
          ],
          "countries": [
            "xx"
          ],
          "birth_dates": [
            "1980-04-12"
          ],
          "nationalities": [
            "xx"
          ],
          "identifiers": {
            "passportNumber": [
              "X0000000"
            ]
          },
          "why": {
            "name": {
              "score": 0.97,
              "effect": "raises",
              "exact": [
                "jane",
                "example"
              ],
              "close": [],
              "equivalent": [],
              "only_in_listed": [],
              "only_in_yours": []
            },
            "birth_date": {
              "score": 0,
              "effect": "none",
              "note": "Same birth date"
            }
          },
          "details": {
            "aliases": [
              "Jane Q. Example",
              "Jane Exampleova"
            ],
            "addresses": [
              "1 Example Street, Example City, 00000"
            ],
            "sanctions": [
              {
                "authority": "Example Sanctions Office",
                "program": "EXAMPLE-2024",
                "reason": "Listed for supporting a sanctioned regime (fictional).",
                "country": "xx",
                "start_date": "2024-02-01",
                "end_date": null
              }
            ],
            "sanctions_total": 1,
            "positions": [
              "Director, Example Holdings"
            ],
            "birth_places": [
              "Example City"
            ],
            "gender": "female",
            "first_seen": "2024-02-02T09:00:00",
            "last_seen": "2026-10-01T06:00:00",
            "last_change": "2025-06-11T14:20:00"
          }
        },
        {
          "id": "ent_be5253d97f8da094418c",
          "name": "Janet EXAMPLE",
          "type": "Person",
          "score": 0.61,
          "match": false,
          "topics": [
            "PEP"
          ],
          "lists": [
            "Example Politically Exposed Persons List"
          ],
          "countries": [
            "xx"
          ],
          "birth_dates": [
            "1975"
          ],
          "nationalities": [],
          "identifiers": {},
          "why": {
            "name": {
              "score": 0.82,
              "effect": "raises",
              "exact": [
                "example"
              ],
              "close": [
                {
                  "yours": "jane",
                  "listed": "janet",
                  "similarity": 0.8
                }
              ],
              "equivalent": [],
              "only_in_listed": [],
              "only_in_yours": []
            },
            "birth_year": {
              "score": 0.2,
              "effect": "lowers",
              "note": "Birth years differ: 1980 / 1975"
            }
          }
        }
      ]
    },
    "warnings": [],
    "error": null
  },
  "osint.web": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 6800,
    "data": {
      "query": "Example Holdings",
      "mode": "adverse",
      "complete": true,
      "count": 1,
      "results": [
        {
          "title": "Regulator fines Example Holdings over reporting failures",
          "site": "news.example.com",
          "url": "https://news.example.com/2026/03/example-holdings-fine",
          "date": "2026-03-14",
          "topics": [
            "reg.action"
          ],
          "snippet": "The regulator said Example Holdings failed to file required reports on time."
        }
      ],
      "left_out": {
        "not_about_this_name": 3,
        "not_adverse": 5,
        "list_entries": 0
      }
    },
    "warnings": [],
    "error": null
  },
  "screen.crypto": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 95,
    "data": {
      "checked": 3,
      "counts": {
        "high": 1,
        "medium": 0,
        "low": 0,
        "no_record": 1,
        "unreadable": 0,
        "invalid_address": 0,
        "unrecognised": 1,
        "disputed_listing": 0
      },
      "results": [
        {
          "address": "0x1111111111111111111111111111111111111111",
          "network": "Ethereum-compatible",
          "valid_format": true,
          "checksum_ok": false,
          "format_note": "format correct; this spelling has no mixed-case checksum",
          "verdict": "illicit",
          "risk": "high",
          "summary": "Listed for heist.",
          "flags": [
            "illicit",
            "service_attribution"
          ],
          "listings": [
            {
              "network": "Ethereum",
              "categories": [
                "heist"
              ],
              "risk_class": "illicit",
              "subcategory": null,
              "victim_contract": false
            }
          ],
          "disputed_by": [],
          "schemes": [],
          "labels": [
            {
              "network": "BNB Chain",
              "label": "Null: 0x111...111"
            },
            {
              "network": "Ethereum",
              "label": "Null: 0x111...111"
            },
            {
              "network": "Polygon",
              "label": "Null: 0x111...111"
            }
          ]
        },
        {
          "address": "0x9d8f1c2a6b7e4d3c5a0f8e1b2c3d4e5f6a7b8c9d",
          "network": "Ethereum-compatible",
          "valid_format": true,
          "checksum_ok": false,
          "format_note": "format correct; this spelling has no mixed-case checksum",
          "verdict": "no_record",
          "risk": "unknown",
          "summary": null,
          "flags": []
        },
        {
          "address": "not-a-wallet",
          "network": null,
          "valid_format": null,
          "checksum_ok": null,
          "format_note": "address format is not supported for checksum validation",
          "verdict": "unrecognised",
          "risk": "unknown",
          "summary": null,
          "flags": []
        }
      ]
    },
    "warnings": [],
    "error": null
  },
  "verify.contact": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 4100,
    "data": {
      "email": {
        "email": "jane.doe@example.com",
        "domain": "example.com",
        "syntax_ok": true,
        "suggestion": null,
        "disposable": false,
        "free_provider": false,
        "mail_server": {
          "found": true,
          "hosts": [
            "mx1.example.com",
            "mx2.example.com"
          ]
        },
        "mailbox": "exists",
        "deliverable": "yes",
        "risk": {
          "level": "low",
          "reasons": []
        }
      },
      "phone": {
        "phone": "+250788000000",
        "valid": true,
        "format": {
          "e164": "+250788000000",
          "national": "0788 000 000",
          "international": "+250 788 000 000"
        },
        "country": {
          "code": "RW",
          "name": "Rwanda",
          "calling_code": "+250"
        },
        "location": null,
        "line": {
          "type": "mobile",
          "carrier": "Example Mobile",
          "mcc": "635",
          "mnc": "10"
        },
        "status": "active",
        "sms_pumping": {
          "score": 12,
          "carrier_risk": "low",
          "blocked": false,
          "blocked_on": null,
          "blocked_last_3_months": false
        },
        "sim_swap": {
          "available": false,
          "reason": "Not offered for numbers in this country."
        },
        "call_forwarding": {
          "available": false,
          "reason": "Not offered for numbers in this country."
        },
        "caller": {
          "available": false,
          "reason": "No data for this number."
        },
        "risk": {
          "level": "low",
          "reasons": []
        }
      },
      "ip": {
        "ip": "203.0.113.42",
        "version": 4,
        "location": {
          "continent": "EU",
          "country_code": "NL",
          "country": "Netherlands",
          "region": "North Holland",
          "city": "Amsterdam",
          "coordinates": {
            "lat": 52.374,
            "lon": 4.8897
          },
          "timezones": [
            "Europe/Amsterdam"
          ]
        },
        "network": {
          "asn": 64500,
          "organization": "Example Hosting B.V.",
          "connection_type": "datacenter",
          "isp": "Example Hosting B.V.",
          "operator": "Example VPN Ltd",
          "domain": "example-hosting.example",
          "hostnames": [
            "vpn-42.example-hosting.example"
          ],
          "mobile": false
        },
        "anonymity": {
          "tor": false,
          "vpn": true,
          "datacenter": true,
          "cloud_provider": null,
          "private_relay": false,
          "relay_region": null,
          "blocklisted": false,
          "proxy": false
        },
        "reputation": {
          "abuse_score": 0,
          "reports": 0,
          "distinct_reporters": 0,
          "last_reported": null,
          "usage": "Data Center/Web Hosting/Transit",
          "allowlisted": false
        },
        "risk": {
          "level": "medium",
          "reasons": [
            "A VPN address.",
            "A data centre or hosting address, not a home or mobile connection."
          ]
        }
      },
      "screening": {
        "query": {
          "name": "Jane Example",
          "type": "Person",
          "birth_date": "1980-04-12",
          "countries": [
            "xx"
          ],
          "id_numbers": []
        },
        "summary": {
          "results": 2,
          "matches": 1,
          "top_score": 0.93
        },
        "results": [
          {
            "id": "ent_2cea995ec08e7dbbb4e4",
            "name": "Jane EXAMPLE",
            "type": "Person",
            "score": 0.93,
            "match": true,
            "topics": [
              "Sanction"
            ],
            "lists": [
              "Example Sanctions List"
            ],
            "countries": [
              "xx"
            ],
            "birth_dates": [
              "1980-04-12"
            ],
            "nationalities": [
              "xx"
            ],
            "identifiers": {
              "passportNumber": [
                "X0000000"
              ]
            },
            "why": {
              "name": {
                "score": 0.97,
                "effect": "raises",
                "exact": [
                  "jane",
                  "example"
                ],
                "close": [],
                "equivalent": [],
                "only_in_listed": [],
                "only_in_yours": []
              },
              "birth_date": {
                "score": 0,
                "effect": "none",
                "note": "Same birth date"
              }
            },
            "details": {
              "aliases": [
                "Jane Q. Example",
                "Jane Exampleova"
              ],
              "addresses": [
                "1 Example Street, Example City, 00000"
              ],
              "sanctions": [
                {
                  "authority": "Example Sanctions Office",
                  "program": "EXAMPLE-2024",
                  "reason": "Listed for supporting a sanctioned regime (fictional).",
                  "country": "xx",
                  "start_date": "2024-02-01",
                  "end_date": null
                }
              ],
              "sanctions_total": 1,
              "positions": [
                "Director, Example Holdings"
              ],
              "birth_places": [
                "Example City"
              ],
              "gender": "female",
              "first_seen": "2024-02-02T09:00:00",
              "last_seen": "2026-10-01T06:00:00",
              "last_change": "2025-06-11T14:20:00"
            }
          },
          {
            "id": "ent_be5253d97f8da094418c",
            "name": "Janet EXAMPLE",
            "type": "Person",
            "score": 0.61,
            "match": false,
            "topics": [
              "PEP"
            ],
            "lists": [
              "Example Politically Exposed Persons List"
            ],
            "countries": [
              "xx"
            ],
            "birth_dates": [
              "1975"
            ],
            "nationalities": [],
            "identifiers": {},
            "why": {
              "name": {
                "score": 0.82,
                "effect": "raises",
                "exact": [
                  "example"
                ],
                "close": [
                  {
                    "yours": "jane",
                    "listed": "janet",
                    "similarity": 0.8
                  }
                ],
                "equivalent": [],
                "only_in_listed": [],
                "only_in_yours": []
              },
              "birth_year": {
                "score": 0.2,
                "effect": "lowers",
                "note": "Birth years differ: 1980 / 1975"
              }
            }
          }
        ]
      },
      "wallet": {
        "checked": 1,
        "counts": {
          "high": 0,
          "medium": 0,
          "low": 0,
          "no_record": 1,
          "unreadable": 0,
          "invalid_address": 0,
          "unrecognised": 0,
          "disputed_listing": 0
        },
        "results": [
          {
            "address": "0x9d8f1c2a6b7e4d3c5a0f8e1b2c3d4e5f6a7b8c9d",
            "network": "Ethereum-compatible",
            "valid_format": true,
            "checksum_ok": false,
            "format_note": "format correct; this spelling has no mixed-case checksum",
            "verdict": "no_record",
            "risk": "unknown",
            "summary": null,
            "flags": []
          }
        ]
      }
    },
    "warnings": [],
    "error": null
  },
  "poa.analyze": {
    "ok": true,
    "request_id": "req_7c1e2a9b40d35f6e8a12",
    "latency_ms": 21400,
    "data": {
      "schema_version": "1.0",
      "file": {
        "kind": "image",
        "pages": 1,
        "pages_analyzed": 1,
        "sha256": "9f2c0b7e41a3d58c"
      },
      "document": {
        "is_proof_of_address": true,
        "what_it_is": "A water utility bill",
        "not_accepted_because": null,
        "type": "utility_bill",
        "title_as_printed": "Water bill",
        "country": "RW",
        "languages": [
          "en"
        ],
        "issue_date": "2026-09-02",
        "period_end": "2026-08-31"
      },
      "issuer": {
        "name": "Example Water Ltd",
        "type": "utility",
        "contact_as_printed": "+250 700 000 000"
      },
      "holder": {
        "names": [
          "Jane Example"
        ],
        "role": "account_holder",
        "national_id": {
          "scheme": null,
          "value_masked": null
        }
      },
      "address": {
        "role": "service_address",
        "raw": "KG 000 St, Kacyiru, Gasabo, Kigali",
        "street": "KG 000 St",
        "sector": "Kacyiru",
        "district": "Gasabo",
        "city": "Kigali",
        "country": "RW"
      },
      "account": {
        "account_number": "000123456",
        "references": [
          {
            "kind": "invoice",
            "value": "INV-0001"
          }
        ]
      },
      "amounts": {
        "amount_due": 12500,
        "currency": "RWF",
        "line_items": [
          {
            "label": "Water",
            "amount": 12500
          }
        ]
      },
      "forensics": {
        "integrity": {
          "edited_text_suspected": false,
          "totals_consistent": true,
          "pixel_check": "clean"
        },
        "capture": {
          "screen_photo": false,
          "photocopy": false,
          "page_complete": true
        }
      },
      "verification": {
        "comparisons": {
          "name_vs_id": {
            "status": "match",
            "score": null
          },
          "address_vs_declared": {
            "status": "match",
            "score": null
          },
          "country_vs_expected": {
            "status": "match",
            "score": null
          }
        },
        "recency": {
          "status": "pass",
          "days_old": 33,
          "max_days": 90,
          "date_used": "2026-09-02"
        },
        "document_type": {
          "status": "pass",
          "type": "utility_bill"
        },
        "integrity": {
          "status": "pass"
        },
        "authenticity_score": 92,
        "decision": "pass",
        "reasons": [
          {
            "code": "recent",
            "label": "Issued within 90 days",
            "tone": "good"
          }
        ]
      }
    },
    "warnings": [],
    "error": null
  }
};
