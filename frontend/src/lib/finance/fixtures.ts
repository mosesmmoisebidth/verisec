/**
 * Saved API responses: what the MICR and Card APIs returned for the sample
 * images in `public/finance/samples/`, captured from the running services on
 * 2026-10-07 in the current shape (cards with their bank record and flag; one
 * full deep read). Generated, not hand-written.
 *
 * Used when the services can't be reached (a sample still shows a genuine
 * result), and as the example responses in the Playground and its docs.
 * Re-capture, don't edit.
 */

import type { BinRecord, CardResponse, ChequeDeepRead, ChequeResponse } from "./types";

export const chequeUs: ChequeResponse = {
  "id": "chq_sample",
  "object": "cheque",
  "created_at": "2026-10-07T00:00:00Z",
  "source": "playground",
  "env": "test",
  "processing_ms": 805,
  "image": {
    "width": 1024,
    "height": 679,
    "url": "/v2/cheques/chq_sample/image"
  },
  "status": "read",
  "zones_detected": 1,
  "zones": [
    {
      "index": 0,
      "confidences": [
        87.96448,
        100.0,
        90.60482,
        91.07006,
        90.75725,
        91.02284,
        91.12801,
        90.65019,
        89.95683,
        91.19652,
        89.89574,
        90.37725,
        90.74603,
        90.9943,
        90.83947,
        90.65749,
        87.96448,
        90.60194,
        90.89545,
        90.65404,
        91.155,
        90.60714,
        91.89413,
        90.37437,
        90.97172,
        88.95468,
        90.48642,
        89.94859,
        90.52249,
        89.61477,
        91.01123,
        89.98785,
        90.1868,
        90.48211,
        90.21505,
        90.55112
      ],
      "description": "E-13B",
      "klass": 1,
      "skew": 0.0,
      "text": "C370694CA102000979A68008192429291C",
      "warpedBox": [
        163.0,
        444.0,
        630.0,
        444.0,
        630.0,
        516.0,
        163.0,
        516.0
      ],
      "font": "E-13B",
      "printed": "â‘ˆ370694â‘ˆâ‘†102000979â‘†68008192429291â‘ˆ",
      "confidence": 88.0,
      "char_confidences": [
        90.6,
        91.1,
        90.8,
        91.0,
        91.1,
        90.7,
        90.0,
        91.2,
        89.9,
        90.4,
        90.7,
        91.0,
        90.8,
        90.7,
        88.0,
        90.6,
        90.9,
        90.7,
        91.2,
        90.6,
        91.9,
        90.4,
        91.0,
        89.0,
        90.5,
        89.9,
        90.5,
        89.6,
        91.0,
        90.0,
        90.2,
        90.5,
        90.2,
        90.6
      ],
      "min_char_confidence": 88.0,
      "box": [
        163.0,
        444.0,
        630.0,
        444.0,
        630.0,
        516.0,
        163.0,
        516.0
      ],
      "segments": [
        "370694",
        "102000979",
        "68008192429291"
      ],
      "fields": [
        {
          "Auxiliary On-Us": "370694"
        },
        {
          "Routing": "102000979"
        },
        {
          "Account": "68008192429291"
        }
      ],
      "field_list": [
        {
          "name": "Auxiliary On-Us",
          "value": "370694"
        },
        {
          "name": "EPC",
          "value": ""
        },
        {
          "name": "Routing",
          "value": "102000979"
        },
        {
          "name": "Account",
          "value": "68008192429291"
        },
        {
          "name": "Check number",
          "value": ""
        },
        {
          "name": "Amount",
          "value": ""
        }
      ],
      "template": "us_business",
      "routing": {
        "valid": true,
        "checksum_pass": true,
        "check_digit": 9,
        "expected_check_digit": 9,
        "prefix_valid": true,
        "institution_type": "bank",
        "federal_reserve_district": "Kansas City"
      }
    }
  ],
  "micr": {
    "index": 0,
    "confidences": [
      87.96448,
      100.0,
      90.60482,
      91.07006,
      90.75725,
      91.02284,
      91.12801,
      90.65019,
      89.95683,
      91.19652,
      89.89574,
      90.37725,
      90.74603,
      90.9943,
      90.83947,
      90.65749,
      87.96448,
      90.60194,
      90.89545,
      90.65404,
      91.155,
      90.60714,
      91.89413,
      90.37437,
      90.97172,
      88.95468,
      90.48642,
      89.94859,
      90.52249,
      89.61477,
      91.01123,
      89.98785,
      90.1868,
      90.48211,
      90.21505,
      90.55112
    ],
    "description": "E-13B",
    "klass": 1,
    "skew": 0.0,
    "text": "C370694CA102000979A68008192429291C",
    "warpedBox": [
      163.0,
      444.0,
      630.0,
      444.0,
      630.0,
      516.0,
      163.0,
      516.0
    ],
    "font": "E-13B",
    "printed": "â‘ˆ370694â‘ˆâ‘†102000979â‘†68008192429291â‘ˆ",
    "confidence": 88.0,
    "char_confidences": [
      90.6,
      91.1,
      90.8,
      91.0,
      91.1,
      90.7,
      90.0,
      91.2,
      89.9,
      90.4,
      90.7,
      91.0,
      90.8,
      90.7,
      88.0,
      90.6,
      90.9,
      90.7,
      91.2,
      90.6,
      91.9,
      90.4,
      91.0,
      89.0,
      90.5,
      89.9,
      90.5,
      89.6,
      91.0,
      90.0,
      90.2,
      90.5,
      90.2,
      90.6
    ],
    "min_char_confidence": 88.0,
    "box": [
      163.0,
      444.0,
      630.0,
      444.0,
      630.0,
      516.0,
      163.0,
      516.0
    ],
    "segments": [
      "370694",
      "102000979",
      "68008192429291"
    ],
    "fields": [
      {
        "Auxiliary On-Us": "370694"
      },
      {
        "Routing": "102000979"
      },
      {
        "Account": "68008192429291"
      }
    ],
    "field_list": [
      {
        "name": "Auxiliary On-Us",
        "value": "370694"
      },
      {
        "name": "EPC",
        "value": ""
      },
      {
        "name": "Routing",
        "value": "102000979"
      },
      {
        "name": "Account",
        "value": "68008192429291"
      },
      {
        "name": "Check number",
        "value": ""
      },
      {
        "name": "Amount",
        "value": ""
      }
    ],
    "template": "us_business",
    "routing": {
      "valid": true,
      "checksum_pass": true,
      "check_digit": 9,
      "expected_check_digit": 9,
      "prefix_valid": true,
      "institution_type": "bank",
      "federal_reserve_district": "Kansas City"
    }
  },
  "quality": {
    "rotation": 0.0,
    "skew": 0.0,
    "min_char_confidence": 88.0
  }
};

export const chequeCa: ChequeResponse = {
  "id": "chq_sample",
  "object": "cheque",
  "created_at": "2026-10-07T00:00:00Z",
  "source": "playground",
  "env": "test",
  "processing_ms": 494,
  "image": {
    "width": 1280,
    "height": 720,
    "url": "/v2/cheques/chq_sample/image"
  },
  "status": "read",
  "zones_detected": 1,
  "zones": [
    {
      "index": 0,
      "confidences": [
        89.76532,
        100.0,
        90.6479,
        90.24546,
        90.50425,
        90.83599,
        89.76532,
        90.80359,
        90.72768,
        91.24286,
        90.89553,
        90.90675,
        90.94511,
        91.27689,
        90.67178,
        91.29035,
        91.11637,
        90.38084,
        90.87786,
        90.41476,
        90.67348,
        90.32811,
        90.20984,
        90.30419,
        90.6788,
        90.89343,
        91.18104,
        90.19901,
        89.90921,
        90.82372,
        90.37897,
        90.6532
      ],
      "description": "E-13B",
      "klass": 1,
      "skew": 0.0,
      "text": "C35141075CA97832D002A02349D15C",
      "warpedBox": [
        185.0,
        492.0,
        801.0,
        492.0,
        801.0,
        553.0,
        185.0,
        553.0
      ],
      "font": "E-13B",
      "printed": "â‘ˆ35141075â‘ˆâ‘†97832â‘‰002â‘†02349â‘‰15â‘ˆ",
      "confidence": 89.8,
      "char_confidences": [
        90.6,
        90.2,
        90.5,
        90.8,
        89.8,
        90.8,
        90.7,
        91.2,
        90.9,
        90.9,
        90.9,
        91.3,
        90.7,
        91.3,
        91.1,
        90.4,
        90.9,
        90.4,
        90.7,
        90.3,
        90.2,
        90.3,
        90.7,
        90.9,
        91.2,
        90.2,
        89.9,
        90.8,
        90.4,
        90.7
      ],
      "min_char_confidence": 89.8,
      "box": [
        185.0,
        492.0,
        801.0,
        492.0,
        801.0,
        553.0,
        185.0,
        553.0
      ],
      "segments": [
        "35141075",
        "97832",
        "002",
        "02349",
        "15"
      ],
      "fields": [],
      "field_list": [
        {
          "name": "Auxiliary On-Us",
          "value": ""
        },
        {
          "name": "EPC",
          "value": ""
        },
        {
          "name": "Routing",
          "value": ""
        },
        {
          "name": "Account",
          "value": ""
        },
        {
          "name": "Check number",
          "value": ""
        },
        {
          "name": "Amount",
          "value": ""
        }
      ],
      "standard": {
        "id": "ca_cpa_006",
        "name": "Canada (Payments Canada Standard 006)",
        "country": "CA",
        "fields": [
          {
            "name": "Serial Number",
            "value": "35141075"
          },
          {
            "name": "Branch (Transit)",
            "value": "97832"
          },
          {
            "name": "Institution",
            "value": "002"
          },
          {
            "name": "Account",
            "value": "02349D15"
          }
        ],
        "field_list": [
          {
            "name": "Serial Number",
            "value": "35141075"
          },
          {
            "name": "Branch (Transit)",
            "value": "97832"
          },
          {
            "name": "Institution",
            "value": "002"
          },
          {
            "name": "Account",
            "value": "02349D15"
          },
          {
            "name": "Transaction Code",
            "value": ""
          },
          {
            "name": "Amount",
            "value": ""
          }
        ]
      }
    }
  ],
  "micr": {
    "index": 0,
    "confidences": [
      89.76532,
      100.0,
      90.6479,
      90.24546,
      90.50425,
      90.83599,
      89.76532,
      90.80359,
      90.72768,
      91.24286,
      90.89553,
      90.90675,
      90.94511,
      91.27689,
      90.67178,
      91.29035,
      91.11637,
      90.38084,
      90.87786,
      90.41476,
      90.67348,
      90.32811,
      90.20984,
      90.30419,
      90.6788,
      90.89343,
      91.18104,
      90.19901,
      89.90921,
      90.82372,
      90.37897,
      90.6532
    ],
    "description": "E-13B",
    "klass": 1,
    "skew": 0.0,
    "text": "C35141075CA97832D002A02349D15C",
    "warpedBox": [
      185.0,
      492.0,
      801.0,
      492.0,
      801.0,
      553.0,
      185.0,
      553.0
    ],
    "font": "E-13B",
    "printed": "â‘ˆ35141075â‘ˆâ‘†97832â‘‰002â‘†02349â‘‰15â‘ˆ",
    "confidence": 89.8,
    "char_confidences": [
      90.6,
      90.2,
      90.5,
      90.8,
      89.8,
      90.8,
      90.7,
      91.2,
      90.9,
      90.9,
      90.9,
      91.3,
      90.7,
      91.3,
      91.1,
      90.4,
      90.9,
      90.4,
      90.7,
      90.3,
      90.2,
      90.3,
      90.7,
      90.9,
      91.2,
      90.2,
      89.9,
      90.8,
      90.4,
      90.7
    ],
    "min_char_confidence": 89.8,
    "box": [
      185.0,
      492.0,
      801.0,
      492.0,
      801.0,
      553.0,
      185.0,
      553.0
    ],
    "segments": [
      "35141075",
      "97832",
      "002",
      "02349",
      "15"
    ],
    "fields": [],
    "field_list": [
      {
        "name": "Auxiliary On-Us",
        "value": ""
      },
      {
        "name": "EPC",
        "value": ""
      },
      {
        "name": "Routing",
        "value": ""
      },
      {
        "name": "Account",
        "value": ""
      },
      {
        "name": "Check number",
        "value": ""
      },
      {
        "name": "Amount",
        "value": ""
      }
    ],
    "standard": {
      "id": "ca_cpa_006",
      "name": "Canada (Payments Canada Standard 006)",
      "country": "CA",
      "fields": [
        {
          "name": "Serial Number",
          "value": "35141075"
        },
        {
          "name": "Branch (Transit)",
          "value": "97832"
        },
        {
          "name": "Institution",
          "value": "002"
        },
        {
          "name": "Account",
          "value": "02349D15"
        }
      ],
      "field_list": [
        {
          "name": "Serial Number",
          "value": "35141075"
        },
        {
          "name": "Branch (Transit)",
          "value": "97832"
        },
        {
          "name": "Institution",
          "value": "002"
        },
        {
          "name": "Account",
          "value": "02349D15"
        },
        {
          "name": "Transaction Code",
          "value": ""
        },
        {
          "name": "Amount",
          "value": ""
        }
      ]
    }
  },
  "country": {
    "code": "CA",
    "name": "Canada",
    "flag": "ðŸ‡¨ðŸ‡¦",
    "source": "micr_line"
  },
  "quality": {
    "rotation": 0.0,
    "skew": 0.0,
    "min_char_confidence": 89.8
  }
};

export const chequeBr: ChequeResponse = {
  "id": "chq_sample",
  "object": "cheque",
  "created_at": "2026-10-07T00:00:00Z",
  "source": "playground",
  "env": "test",
  "processing_ms": 525,
  "image": {
    "width": 1280,
    "height": 720,
    "url": "/v2/cheques/chq_sample/image"
  },
  "status": "read",
  "zones_detected": 1,
  "zones": [
    {
      "index": 0,
      "confidences": [
        90.26926,
        100.0,
        90.56194,
        90.61038,
        90.56726,
        90.69818,
        90.47925,
        90.85972,
        90.70061,
        90.46438,
        90.51564,
        90.9525,
        90.79409,
        90.84019,
        90.50387,
        90.69275,
        90.68221,
        90.81922,
        90.99133,
        90.7485,
        90.56416,
        90.47739,
        90.83705,
        90.5643,
        90.78447,
        90.75924,
        90.26926,
        90.41672,
        90.77742,
        90.81052,
        90.75139,
        90.63512,
        90.53387,
        90.56613,
        90.79077,
        90.84497
      ],
      "description": "CMC-7",
      "klass": 2,
      "skew": 0.0,
      "text": "H10443928H0183012765I700600004022F",
      "warpedBox": [
        0.0,
        473.0,
        1168.0,
        473.0,
        1168.0,
        540.0,
        0.0,
        540.0
      ],
      "font": "CMC-7",
      "printed": "|10443928|0183012765|700600004022|",
      "confidence": 90.3,
      "char_confidences": [
        90.6,
        90.6,
        90.6,
        90.7,
        90.5,
        90.9,
        90.7,
        90.5,
        90.5,
        91.0,
        90.8,
        90.8,
        90.5,
        90.7,
        90.7,
        90.8,
        91.0,
        90.7,
        90.6,
        90.5,
        90.8,
        90.6,
        90.8,
        90.8,
        90.3,
        90.4,
        90.8,
        90.8,
        90.8,
        90.6,
        90.5,
        90.6,
        90.8,
        90.8
      ],
      "min_char_confidence": 90.3,
      "box": [
        0.0,
        473.0,
        1168.0,
        473.0,
        1168.0,
        540.0,
        0.0,
        540.0
      ],
      "segments": [
        "10443928",
        "0183012765",
        "700600004022"
      ],
      "fields": [
        {
          "Bank": "104"
        },
        {
          "Agency": "4392"
        },
        {
          "DV2": "8"
        },
        {
          "Bank code": "018"
        },
        {
          "Check number": "301276"
        },
        {
          "Typification": "5"
        },
        {
          "DV1": "7"
        },
        {
          "Account": "0060000402"
        },
        {
          "DV3": "2"
        }
      ],
      "field_list": [
        {
          "name": "Bank",
          "value": "104"
        },
        {
          "name": "Agency",
          "value": "4392"
        },
        {
          "name": "DV2",
          "value": "8"
        },
        {
          "name": "Bank code",
          "value": "018"
        },
        {
          "name": "Check number",
          "value": "301276"
        },
        {
          "name": "Typification",
          "value": "5"
        },
        {
          "name": "DV1",
          "value": "7"
        },
        {
          "name": "Account",
          "value": "0060000402"
        },
        {
          "name": "DV3",
          "value": "2"
        }
      ],
      "template": "br_cmc7"
    }
  ],
  "micr": {
    "index": 0,
    "confidences": [
      90.26926,
      100.0,
      90.56194,
      90.61038,
      90.56726,
      90.69818,
      90.47925,
      90.85972,
      90.70061,
      90.46438,
      90.51564,
      90.9525,
      90.79409,
      90.84019,
      90.50387,
      90.69275,
      90.68221,
      90.81922,
      90.99133,
      90.7485,
      90.56416,
      90.47739,
      90.83705,
      90.5643,
      90.78447,
      90.75924,
      90.26926,
      90.41672,
      90.77742,
      90.81052,
      90.75139,
      90.63512,
      90.53387,
      90.56613,
      90.79077,
      90.84497
    ],
    "description": "CMC-7",
    "klass": 2,
    "skew": 0.0,
    "text": "H10443928H0183012765I700600004022F",
    "warpedBox": [
      0.0,
      473.0,
      1168.0,
      473.0,
      1168.0,
      540.0,
      0.0,
      540.0
    ],
    "font": "CMC-7",
    "printed": "|10443928|0183012765|700600004022|",
    "confidence": 90.3,
    "char_confidences": [
      90.6,
      90.6,
      90.6,
      90.7,
      90.5,
      90.9,
      90.7,
      90.5,
      90.5,
      91.0,
      90.8,
      90.8,
      90.5,
      90.7,
      90.7,
      90.8,
      91.0,
      90.7,
      90.6,
      90.5,
      90.8,
      90.6,
      90.8,
      90.8,
      90.3,
      90.4,
      90.8,
      90.8,
      90.8,
      90.6,
      90.5,
      90.6,
      90.8,
      90.8
    ],
    "min_char_confidence": 90.3,
    "box": [
      0.0,
      473.0,
      1168.0,
      473.0,
      1168.0,
      540.0,
      0.0,
      540.0
    ],
    "segments": [
      "10443928",
      "0183012765",
      "700600004022"
    ],
    "fields": [
      {
        "Bank": "104"
      },
      {
        "Agency": "4392"
      },
      {
        "DV2": "8"
      },
      {
        "Bank code": "018"
      },
      {
        "Check number": "301276"
      },
      {
        "Typification": "5"
      },
      {
        "DV1": "7"
      },
      {
        "Account": "0060000402"
      },
      {
        "DV3": "2"
      }
    ],
    "field_list": [
      {
        "name": "Bank",
        "value": "104"
      },
      {
        "name": "Agency",
        "value": "4392"
      },
      {
        "name": "DV2",
        "value": "8"
      },
      {
        "name": "Bank code",
        "value": "018"
      },
      {
        "name": "Check number",
        "value": "301276"
      },
      {
        "name": "Typification",
        "value": "5"
      },
      {
        "name": "DV1",
        "value": "7"
      },
      {
        "name": "Account",
        "value": "0060000402"
      },
      {
        "name": "DV3",
        "value": "2"
      }
    ],
    "template": "br_cmc7"
  },
  "quality": {
    "rotation": 0.0,
    "skew": 0.0,
    "min_char_confidence": 90.3
  }
};

export const chequeDeepUs: ChequeDeepRead = {
  "id": "chq_sample",
  "object": "cheque_read",
  "created_at": "2026-10-07T00:00:00Z",
  "source": "playground",
  "env": "test",
  "processing_ms": 288,
  "image": {
    "width": 1024,
    "height": 679,
    "url": "/v2/cheques/chq_sample/image"
  },
  "status": "read",
  "micr": {
    "id": "chq_sample",
    "object": "cheque",
    "created_at": "2026-10-07T00:00:00Z",
    "source": "playground",
    "env": "test",
    "processing_ms": 288,
    "image": {
      "width": 1024,
      "height": 679,
      "url": "/v2/cheques/chq_sample/image"
    },
    "status": "read",
    "zones_detected": 1,
    "zones": [
      {
        "index": 0,
        "confidences": [
          87.96448,
          100.0,
          90.60482,
          91.07006,
          90.75725,
          91.02284,
          91.12801,
          90.65019,
          89.95683,
          91.19652,
          89.89574,
          90.37725,
          90.74603,
          90.9943,
          90.83947,
          90.65749,
          87.96448,
          90.60194,
          90.89545,
          90.65404,
          91.155,
          90.60714,
          91.89413,
          90.37437,
          90.97172,
          88.95468,
          90.48642,
          89.94859,
          90.52249,
          89.61477,
          91.01123,
          89.98785,
          90.1868,
          90.48211,
          90.21505,
          90.55112
        ],
        "description": "E-13B",
        "klass": 1,
        "skew": 0.0,
        "text": "C370694CA102000979A68008192429291C",
        "warpedBox": [
          163.0,
          444.0,
          630.0,
          444.0,
          630.0,
          516.0,
          163.0,
          516.0
        ],
        "font": "E-13B",
        "printed": "â‘ˆ370694â‘ˆâ‘†102000979â‘†68008192429291â‘ˆ",
        "confidence": 88.0,
        "char_confidences": [
          90.6,
          91.1,
          90.8,
          91.0,
          91.1,
          90.7,
          90.0,
          91.2,
          89.9,
          90.4,
          90.7,
          91.0,
          90.8,
          90.7,
          88.0,
          90.6,
          90.9,
          90.7,
          91.2,
          90.6,
          91.9,
          90.4,
          91.0,
          89.0,
          90.5,
          89.9,
          90.5,
          89.6,
          91.0,
          90.0,
          90.2,
          90.5,
          90.2,
          90.6
        ],
        "min_char_confidence": 88.0,
        "box": [
          163.0,
          444.0,
          630.0,
          444.0,
          630.0,
          516.0,
          163.0,
          516.0
        ],
        "segments": [
          "370694",
          "102000979",
          "68008192429291"
        ],
        "fields": [
          {
            "Auxiliary On-Us": "370694"
          },
          {
            "Routing": "102000979"
          },
          {
            "Account": "68008192429291"
          }
        ],
        "field_list": [
          {
            "name": "Auxiliary On-Us",
            "value": "370694"
          },
          {
            "name": "EPC",
            "value": ""
          },
          {
            "name": "Routing",
            "value": "102000979"
          },
          {
            "name": "Account",
            "value": "68008192429291"
          },
          {
            "name": "Check number",
            "value": ""
          },
          {
            "name": "Amount",
            "value": ""
          }
        ],
        "template": "us_business",
        "routing": {
          "valid": true,
          "checksum_pass": true,
          "check_digit": 9,
          "expected_check_digit": 9,
          "prefix_valid": true,
          "institution_type": "bank",
          "federal_reserve_district": "Kansas City"
        }
      }
    ],
    "micr": {
      "index": 0,
      "confidences": [
        87.96448,
        100.0,
        90.60482,
        91.07006,
        90.75725,
        91.02284,
        91.12801,
        90.65019,
        89.95683,
        91.19652,
        89.89574,
        90.37725,
        90.74603,
        90.9943,
        90.83947,
        90.65749,
        87.96448,
        90.60194,
        90.89545,
        90.65404,
        91.155,
        90.60714,
        91.89413,
        90.37437,
        90.97172,
        88.95468,
        90.48642,
        89.94859,
        90.52249,
        89.61477,
        91.01123,
        89.98785,
        90.1868,
        90.48211,
        90.21505,
        90.55112
      ],
      "description": "E-13B",
      "klass": 1,
      "skew": 0.0,
      "text": "C370694CA102000979A68008192429291C",
      "warpedBox": [
        163.0,
        444.0,
        630.0,
        444.0,
        630.0,
        516.0,
        163.0,
        516.0
      ],
      "font": "E-13B",
      "printed": "â‘ˆ370694â‘ˆâ‘†102000979â‘†68008192429291â‘ˆ",
      "confidence": 88.0,
      "char_confidences": [
        90.6,
        91.1,
        90.8,
        91.0,
        91.1,
        90.7,
        90.0,
        91.2,
        89.9,
        90.4,
        90.7,
        91.0,
        90.8,
        90.7,
        88.0,
        90.6,
        90.9,
        90.7,
        91.2,
        90.6,
        91.9,
        90.4,
        91.0,
        89.0,
        90.5,
        89.9,
        90.5,
        89.6,
        91.0,
        90.0,
        90.2,
        90.5,
        90.2,
        90.6
      ],
      "min_char_confidence": 88.0,
      "box": [
        163.0,
        444.0,
        630.0,
        444.0,
        630.0,
        516.0,
        163.0,
        516.0
      ],
      "segments": [
        "370694",
        "102000979",
        "68008192429291"
      ],
      "fields": [
        {
          "Auxiliary On-Us": "370694"
        },
        {
          "Routing": "102000979"
        },
        {
          "Account": "68008192429291"
        }
      ],
      "field_list": [
        {
          "name": "Auxiliary On-Us",
          "value": "370694"
        },
        {
          "name": "EPC",
          "value": ""
        },
        {
          "name": "Routing",
          "value": "102000979"
        },
        {
          "name": "Account",
          "value": "68008192429291"
        },
        {
          "name": "Check number",
          "value": ""
        },
        {
          "name": "Amount",
          "value": ""
        }
      ],
      "template": "us_business",
      "routing": {
        "valid": true,
        "checksum_pass": true,
        "check_digit": 9,
        "expected_check_digit": 9,
        "prefix_valid": true,
        "institution_type": "bank",
        "federal_reserve_district": "Kansas City"
      }
    },
    "quality": {
      "rotation": 0.0,
      "skew": 0.0,
      "min_char_confidence": 88.0
    }
  },
  "vision": {
    "fields": [
      {
        "type": "payee",
        "value": "Sgt Jonathan Hanson"
      },
      {
        "type": "drawer",
        "value": "Barbara A. Wright"
      },
      {
        "type": "legal_amount",
        "value": "FOUR THOUSAND TWO HUNDRED EIGHTY AND 80/100 CENTS"
      },
      {
        "type": "courtesy_amount",
        "value": "4,280.80"
      },
      {
        "type": "date",
        "value": "23/7/1020"
      },
      {
        "type": "bank_name",
        "value": "National City Bank"
      },
      {
        "type": "branch",
        "value": "National City Bank"
      },
      {
        "type": "bank_address",
        "value": "JPMorgan Chase Bank, N.A., Denver Colorado"
      },
      {
        "type": "currency",
        "value": "USD"
      },
      {
        "type": "cheque_number",
        "value": "819242929"
      },
      {
        "type": "account_number",
        "value": "370691"
      },
      {
        "type": "crossing",
        "value": "X"
      }
    ],
    "amount": {
      "figures": "4,280.80",
      "words": "FOUR THOUSAND TWO HUNDRED EIGHTY AND 80/100 CENTS",
      "numeric": 4280.8,
      "agreement": true
    },
    "currency": {
      "code": "USD"
    },
    "date": {
      "raw": "23/7/1020",
      "iso": "2023-07-10"
    },
    "payee": "Sgt Jonathan Hanson",
    "drawer": {
      "name": "Barbara A. Wright"
    },
    "bank": {
      "name": "National City Bank",
      "country": "US",
      "branch": "National City Bank",
      "address": "JPMorgan Chase Bank, N.A., Denver Colorado"
    },
    "crossing": {
      "present": true,
      "text": "X"
    },
    "signature": {
      "present": true,
      "count": 1
    }
  },
  "text_boxes": {
    "width": 1024,
    "height": 679,
    "boxes": [
      {
        "box": [
          178.0,
          487.0,
          610.0,
          450.0,
          612.0,
          470.0,
          179.0,
          507.0
        ],
        "score": 0.754
      },
      {
        "box": [
          44.0,
          442.0,
          86.0,
          442.0,
          86.0,
          457.0,
          44.0,
          457.0
        ],
        "score": 0.795
      },
      {
        "box": [
          96.0,
          428.0,
          294.0,
          411.0,
          296.0,
          436.0,
          99.0,
          454.0
        ],
        "score": 0.847
      },
      {
        "box": [
          543.0,
          412.0,
          717.0,
          397.0,
          718.0,
          411.0,
          544.0,
          426.0
        ],
        "score": 0.641
      },
      {
        "box": [
          40.0,
          400.0,
          143.0,
          393.0,
          144.0,
          409.0,
          41.0,
          416.0
        ],
        "score": 0.782
      },
      {
        "box": [
          540.0,
          402.0,
          779.0,
          379.0,
          780.0,
          397.0,
          542.0,
          420.0
        ],
        "score": 0.546
      },
      {
        "box": [
          541.0,
          390.0,
          650.0,
          380.0,
          651.0,
          395.0,
          543.0,
          405.0
        ],
        "score": 0.674
      },
      {
        "box": [
          34.0,
          368.0,
          232.0,
          354.0,
          234.0,
          388.0,
          37.0,
          402.0
        ],
        "score": 0.871
      },
      {
        "box": [
          742.0,
          352.0,
          781.0,
          349.0,
          784.0,
          376.0,
          744.0,
          379.0
        ],
        "score": 0.71
      },
      {
        "box": [
          533.0,
          347.0,
          728.0,
          334.0,
          731.0,
          383.0,
          536.0,
          396.0
        ],
        "score": 0.698
      },
      {
        "box": [
          535.0,
          341.0,
          594.0,
          335.0,
          596.0,
          350.0,
          537.0,
          356.0
        ],
        "score": 0.541
      },
      {
        "box": [
          615.0,
          339.0,
          651.0,
          335.0,
          652.0,
          347.0,
          616.0,
          350.0
        ],
        "score": 0.526
      },
      {
        "box": [
          757.0,
          316.0,
          807.0,
          311.0,
          809.0,
          340.0,
          759.0,
          345.0
        ],
        "score": 0.813
      },
      {
        "box": [
          30.0,
          308.0,
          83.0,
          305.0,
          83.0,
          318.0,
          30.0,
          321.0
        ],
        "score": 0.767
      },
      {
        "box": [
          30.0,
          296.0,
          60.0,
          296.0,
          60.0,
          309.0,
          30.0,
          309.0
        ],
        "score": 0.865
      },
      {
        "box": [
          773.0,
          290.0,
          801.0,
          290.0,
          801.0,
          302.0,
          773.0,
          302.0
        ],
        "score": 0.715
      },
      {
        "box": [
          103.0,
          320.0,
          708.0,
          274.0,
          710.0,
          300.0,
          105.0,
          345.0
        ],
        "score": 0.756
      },
      {
        "box": [
          87.0,
          276.0,
          491.0,
          251.0,
          494.0,
          292.0,
          90.0,
          318.0
        ],
        "score": 0.813
      },
      {
        "box": [
          615.0,
          262.0,
          630.0,
          262.0,
          630.0,
          278.0,
          615.0,
          278.0
        ],
        "score": 0.803
      },
      {
        "box": [
          681.0,
          246.0,
          769.0,
          238.0,
          771.0,
          262.0,
          683.0,
          269.0
        ],
        "score": 0.89
      },
      {
        "box": [
          750.0,
          209.0,
          794.0,
          205.0,
          795.0,
          220.0,
          752.0,
          224.0
        ],
        "score": 0.797
      },
      {
        "box": [
          635.0,
          186.0,
          648.0,
          188.0,
          645.0,
          207.0,
          632.0,
          205.0
        ],
        "score": 0.241
      },
      {
        "box": [
          312.0,
          190.0,
          496.0,
          177.0,
          498.0,
          200.0,
          314.0,
          214.0
        ],
        "score": 0.851
      },
      {
        "box": [
          659.0,
          181.0,
          790.0,
          169.0,
          792.0,
          197.0,
          662.0,
          209.0
        ],
        "score": 0.849
      },
      {
        "box": [
          110.0,
          187.0,
          704.0,
          145.0,
          705.0,
          159.0,
          110.0,
          201.0
        ],
        "score": 0.602
      }
    ]
  },
  "bank": {
    "read": {
      "name": "National City Bank",
      "country": "US",
      "branch": "National City Bank",
      "address": "JPMorgan Chase Bank, N.A., Denver Colorado"
    },
    "match_confidence": 0.0,
    "alternatives": []
  },
  "country": {
    "code": "US",
    "name": "United States",
    "flag": "ðŸ‡ºðŸ‡¸",
    "source": "cheque_face"
  },
  "currency": {
    "code": "USD",
    "numeric_code": "840",
    "name": "US Dollar",
    "symbol": "$",
    "local_symbol": "$",
    "minor_units": "2",
    "english_name_cldr": "US Dollar",
    "usd_per_unit": "1",
    "units_per_usd": "1",
    "wikidata_id": "Q4917"
  },
  "timing": {
    "micr_ms": 288,
    "model_ms": 2735,
    "boxes_ms": 1322,
    "total_ms": 4182
  }
};

export const cardVisa: CardResponse = {
  "id": "crd_sample",
  "object": "card",
  "created_at": "2026-10-07T00:00:00Z",
  "source": "playground",
  "env": "test",
  "processing_ms": 2410,
  "image": {
    "width": 1200,
    "height": 1600
  },
  "status": "read",
  "cards_detected": 1,
  "cards": [
    {
      "index": 0,
      "confidence": 99.35742,
      "description": "Card #1",
      "fields": [
        {
          "confidence": 87.86598,
          "name": "number",
          "valid": true,
          "value": "4713768012956464"
        },
        {
          "confidence": 86.93623,
          "name": "valid_thru",
          "value": "02/29"
        }
      ],
      "number_valid": true,
      "warpedBox": [
        96.06696,
        672.9067,
        1034.501,
        672.9067,
        1034.501,
        1271.563,
        96.06696,
        1271.563
      ],
      "box": [
        96.1,
        672.9,
        1034.5,
        672.9,
        1034.5,
        1271.6,
        96.1,
        1271.6
      ],
      "number": "4713768012956464",
      "first6": "471376",
      "last4": "6464",
      "length": 16,
      "fingerprint": "cf_ea41ca988a74794884e4c242",
      "luhn_valid": true,
      "scheme_valid": true,
      "scheme_checks": {
        "luhn": true,
        "length": true,
        "iin_known": true
      },
      "network_from_prefix": "Visa",
      "expired": false,
      "expires_in_days": 875,
      "expiry_status": "valid",
      "bin": {
        "network": "Visa",
        "type": "Debit",
        "level": "Classic",
        "funding": "debit",
        "issuer": "BANK OF KIGALI LTD.",
        "country": "RW",
        "currency": "RWF",
        "is_commercial": false,
        "is_prepaid": false,
        "source": "local+online",
        "bin": "471376",
        "category": "consumer",
        "is_reloadable": true,
        "country_name": "Rwanda",
        "country_code3": "RWA",
        "issuer_country": "RW",
        "flag": "ðŸ‡·ðŸ‡¼",
        "currency_name": "Rwanda Franc",
        "flag_url": "/v2/flags/rw.svg"
      },
      "bank": {
        "read": {
          "name": "BANK OF KIGALI LTD.",
          "country": "RW"
        },
        "resolved": {
          "profile_id": "bank_a8f08cc78a99fdb18b",
          "name": "BANK OF KIGALI LIMITED",
          "country": "Rwanda",
          "country_code": "RW",
          "city": "KIGALI",
          "bic": "BKIGRWRW",
          "logo_url": "/v2/banks/bank_a8f08cc78a99fdb18b/logo",
          "flag_url": "/v2/flags/rw.svg"
        },
        "match_confidence": 1.0,
        "alternatives": [],
        "name_match": 0.992
      }
    }
  ],
  "card": {
    "index": 0,
    "confidence": 99.35742,
    "description": "Card #1",
    "fields": [
      {
        "confidence": 87.86598,
        "name": "number",
        "valid": true,
        "value": "4713768012956464"
      },
      {
        "confidence": 86.93623,
        "name": "valid_thru",
        "value": "02/29"
      }
    ],
    "number_valid": true,
    "warpedBox": [
      96.06696,
      672.9067,
      1034.501,
      672.9067,
      1034.501,
      1271.563,
      96.06696,
      1271.563
    ],
    "box": [
      96.1,
      672.9,
      1034.5,
      672.9,
      1034.5,
      1271.6,
      96.1,
      1271.6
    ],
    "number": "4713768012956464",
    "first6": "471376",
    "last4": "6464",
    "length": 16,
    "fingerprint": "cf_ea41ca988a74794884e4c242",
    "luhn_valid": true,
    "scheme_valid": true,
    "scheme_checks": {
      "luhn": true,
      "length": true,
      "iin_known": true
    },
    "network_from_prefix": "Visa",
    "expired": false,
    "expires_in_days": 875,
    "expiry_status": "valid"
  },
  "bin": {
    "network": "Visa",
    "type": "Debit",
    "level": "Classic",
    "funding": "debit",
    "issuer": "BANK OF KIGALI LTD.",
    "country": "RW",
    "currency": "RWF",
    "is_commercial": false,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "471376",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "Rwanda",
    "country_code3": "RWA",
    "issuer_country": "RW",
    "flag": "ðŸ‡·ðŸ‡¼",
    "currency_name": "Rwanda Franc",
    "flag_url": "/v2/flags/rw.svg"
  },
  "bank": {
    "read": {
      "name": "BANK OF KIGALI LTD.",
      "country": "RW"
    },
    "resolved": {
      "profile_id": "bank_a8f08cc78a99fdb18b",
      "name": "BANK OF KIGALI LIMITED",
      "country": "Rwanda",
      "country_code": "RW",
      "city": "KIGALI",
      "bic": "BKIGRWRW",
      "logo_url": "/v2/banks/bank_a8f08cc78a99fdb18b/logo",
      "flag_url": "/v2/flags/rw.svg"
    },
    "match_confidence": 1.0,
    "alternatives": [],
    "name_match": 0.992
  }
};

export const cardMc: CardResponse = {
  "id": "crd_sample",
  "object": "card",
  "created_at": "2026-10-07T00:00:00Z",
  "source": "playground",
  "env": "test",
  "processing_ms": 528,
  "image": {
    "width": 1600,
    "height": 900
  },
  "status": "read",
  "cards_detected": 1,
  "cards": [
    {
      "index": 0,
      "confidence": 99.99998,
      "description": "Card #1",
      "fields": [
        {
          "confidence": 88.36259,
          "name": "number",
          "valid": true,
          "value": "5391232061279498"
        },
        {
          "confidence": 83.48534,
          "name": "valid_thru",
          "value": "05/19"
        },
        {
          "confidence": 84.9837,
          "name": "holder_name",
          "value": "REVOLUT"
        }
      ],
      "number_valid": true,
      "warpedBox": [
        453.3388,
        134.8408,
        994.3773,
        134.8408,
        994.3773,
        516.8605,
        453.3388,
        516.8605
      ],
      "box": [
        453.3,
        134.8,
        994.4,
        134.8,
        994.4,
        516.9,
        453.3,
        516.9
      ],
      "number": "5391232061279498",
      "first6": "539123",
      "last4": "9498",
      "length": 16,
      "fingerprint": "cf_ea0eff571e0bf5ea923721e1",
      "luhn_valid": true,
      "scheme_valid": true,
      "scheme_checks": {
        "luhn": true,
        "length": true,
        "iin_known": true
      },
      "network_from_prefix": "Mastercard",
      "expired": true,
      "expires_in_days": -2686,
      "expiry_status": "expired",
      "bin": {
        "network": "Mastercard",
        "type": "Debit",
        "level": "Prepaid Platinum Travel",
        "funding": "prepaid",
        "issuer": "REVOLUT LTD.",
        "country": "IE",
        "currency": "EUR",
        "is_commercial": false,
        "is_prepaid": true,
        "source": "local+online",
        "bin": "539123",
        "category": "consumer",
        "is_reloadable": false,
        "country_name": "Ireland",
        "country_code3": "IRL",
        "issuer_country": "IE",
        "flag": "ðŸ‡®ðŸ‡ª",
        "currency_name": "Euro",
        "flag_url": "/v2/flags/ie.svg"
      },
      "bank": {
        "read": {
          "name": "REVOLUT LTD.",
          "country": "IE"
        },
        "resolved": {
          "profile_id": "bank_9dc7833cee50265ddb",
          "name": "Revolut Bank UAB",
          "country": "Ireland",
          "country_code": "IE",
          "city": "Dublin",
          "address": "2 Dublin Landings",
          "parent": "Revolut Bank UAB",
          "status": "active",
          "flag_url": "/v2/flags/ie.svg"
        },
        "match_confidence": 0.778,
        "alternatives": [],
        "name_match": 0.812
      }
    }
  ],
  "card": {
    "index": 0,
    "confidence": 99.99998,
    "description": "Card #1",
    "fields": [
      {
        "confidence": 88.36259,
        "name": "number",
        "valid": true,
        "value": "5391232061279498"
      },
      {
        "confidence": 83.48534,
        "name": "valid_thru",
        "value": "05/19"
      },
      {
        "confidence": 84.9837,
        "name": "holder_name",
        "value": "REVOLUT"
      }
    ],
    "number_valid": true,
    "warpedBox": [
      453.3388,
      134.8408,
      994.3773,
      134.8408,
      994.3773,
      516.8605,
      453.3388,
      516.8605
    ],
    "box": [
      453.3,
      134.8,
      994.4,
      134.8,
      994.4,
      516.9,
      453.3,
      516.9
    ],
    "number": "5391232061279498",
    "first6": "539123",
    "last4": "9498",
    "length": 16,
    "fingerprint": "cf_ea0eff571e0bf5ea923721e1",
    "luhn_valid": true,
    "scheme_valid": true,
    "scheme_checks": {
      "luhn": true,
      "length": true,
      "iin_known": true
    },
    "network_from_prefix": "Mastercard",
    "expired": true,
    "expires_in_days": -2686,
    "expiry_status": "expired"
  },
  "bin": {
    "network": "Mastercard",
    "type": "Debit",
    "level": "Prepaid Platinum Travel",
    "funding": "prepaid",
    "issuer": "REVOLUT LTD.",
    "country": "IE",
    "currency": "EUR",
    "is_commercial": false,
    "is_prepaid": true,
    "source": "local+online",
    "bin": "539123",
    "category": "consumer",
    "is_reloadable": false,
    "country_name": "Ireland",
    "country_code3": "IRL",
    "issuer_country": "IE",
    "flag": "ðŸ‡®ðŸ‡ª",
    "currency_name": "Euro",
    "flag_url": "/v2/flags/ie.svg"
  },
  "bank": {
    "read": {
      "name": "REVOLUT LTD.",
      "country": "IE"
    },
    "resolved": {
      "profile_id": "bank_9dc7833cee50265ddb",
      "name": "Revolut Bank UAB",
      "country": "Ireland",
      "country_code": "IE",
      "city": "Dublin",
      "address": "2 Dublin Landings",
      "parent": "Revolut Bank UAB",
      "status": "active",
      "flag_url": "/v2/flags/ie.svg"
    },
    "match_confidence": 0.778,
    "alternatives": [],
    "name_match": 0.812
  }
};

export const cardTerminal: CardResponse = {
  "id": "crd_sample",
  "object": "card",
  "created_at": "2026-10-07T00:00:00Z",
  "source": "playground",
  "env": "test",
  "processing_ms": 99,
  "image": {
    "width": 1600,
    "height": 900
  },
  "status": "unreadable",
  "issue_code": "no_card",
  "issue": "No card found. Lay the card flat, fill most of the frame and keep the number in view.",
  "cards_detected": 0,
  "cards": []
};

/** BIN rows the lookup page can answer offline, copied from the Card API. */
export const OFFLINE_BINS: BinRecord[] = [
  {
    "network": "Visa",
    "type": "Debit",
    "level": "Classic",
    "funding": "debit",
    "issuer": "BANK OF KIGALI LTD.",
    "country": "RW",
    "currency": "RWF",
    "is_commercial": false,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "471376",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "Rwanda",
    "country_code3": "RWA",
    "issuer_country": "RW",
    "flag": "ðŸ‡·ðŸ‡¼",
    "currency_name": "Rwanda Franc",
    "flag_url": "/v2/flags/rw.svg",
    "bank": {
      "read": {
        "name": "BANK OF KIGALI LTD.",
        "country": "RW"
      },
      "resolved": {
        "profile_id": "bank_a8f08cc78a99fdb18b",
        "name": "BANK OF KIGALI LIMITED",
        "country": "Rwanda",
        "country_code": "RW",
        "city": "KIGALI",
        "bic": "BKIGRWRW",
        "logo_url": "/v2/banks/bank_a8f08cc78a99fdb18b/logo",
        "flag_url": "/v2/flags/rw.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [],
      "name_match": 0.992
    }
  },
  {
    "network": "Visa",
    "type": "Credit",
    "level": "Classic",
    "funding": "credit",
    "issuer": "BANK OF KIGALI LTD.",
    "country": "RW",
    "currency": "RWF",
    "is_commercial": false,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "446999",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "Rwanda",
    "country_code3": "RWA",
    "issuer_country": "RW",
    "flag": "ðŸ‡·ðŸ‡¼",
    "currency_name": "Rwanda Franc",
    "flag_url": "/v2/flags/rw.svg",
    "bank": {
      "read": {
        "name": "BANK OF KIGALI LTD.",
        "country": "RW"
      },
      "resolved": {
        "profile_id": "bank_a8f08cc78a99fdb18b",
        "name": "BANK OF KIGALI LIMITED",
        "country": "Rwanda",
        "country_code": "RW",
        "city": "KIGALI",
        "bic": "BKIGRWRW",
        "logo_url": "/v2/banks/bank_a8f08cc78a99fdb18b/logo",
        "flag_url": "/v2/flags/rw.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [],
      "name_match": 0.992
    }
  },
  {
    "network": "Visa",
    "type": "Credit",
    "level": "Gold",
    "funding": "credit",
    "issuer": "EQUITY BANK RWANDA LTD.",
    "country": "RW",
    "currency": "RWF",
    "is_commercial": false,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "421133",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "Rwanda",
    "country_code3": "RWA",
    "issuer_country": "RW",
    "flag": "ðŸ‡·ðŸ‡¼",
    "currency_name": "Rwanda Franc",
    "flag_url": "/v2/flags/rw.svg",
    "bank": {
      "read": {
        "name": "EQUITY BANK RWANDA LTD.",
        "country": "RW"
      },
      "resolved": {
        "profile_id": "bank_c1599567f4aa042bd1",
        "name": "EQUITY BANK RWANDA LIMITED",
        "country": "Rwanda",
        "country_code": "RW",
        "city": "KIGALI",
        "bic": "EQBLRWRW",
        "logo_url": "/v2/banks/bank_c1599567f4aa042bd1/logo",
        "flag_url": "/v2/flags/rw.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [
        {
          "profile_id": "bank_a9544997e72b0bc623",
          "name": "Equity Bank Rwanda",
          "country": "Rwanda",
          "country_code": "RW",
          "logo_url": "/v2/banks/bank_a9544997e72b0bc623/logo",
          "flag_url": "/v2/flags/rw.svg"
        }
      ],
      "name_match": 0.979
    }
  },
  {
    "network": "Visa",
    "type": "Debit",
    "level": "Classic",
    "funding": "debit",
    "issuer": "I&M BANK (RWANDA) PLC",
    "country": "RW",
    "currency": "RWF",
    "is_commercial": false,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "476835",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "Rwanda",
    "country_code3": "RWA",
    "issuer_country": "RW",
    "flag": "ðŸ‡·ðŸ‡¼",
    "currency_name": "Rwanda Franc",
    "flag_url": "/v2/flags/rw.svg",
    "bank": {
      "read": {
        "name": "I&M BANK (RWANDA) PLC",
        "country": "RW"
      },
      "match_confidence": 0.0,
      "alternatives": [
        {
          "profile_id": "bank_9f8bea6dbc856e0bf1",
          "name": "I AND M BANK (RWANDA) LIMITED",
          "country": "Rwanda",
          "country_code": "RW",
          "city": "KIGALI",
          "bic": "IMRWRWRW",
          "logo_url": "/v2/banks/bank_9f8bea6dbc856e0bf1/logo",
          "flag_url": "/v2/flags/rw.svg"
        }
      ],
      "name_match": 0.054
    }
  },
  {
    "network": "Visa",
    "type": "Debit",
    "level": "Classic",
    "funding": "debit",
    "issuer": "KENYA COMMERCIAL BANK",
    "country": "KE",
    "currency": "KES",
    "is_commercial": false,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "403321",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "Kenya",
    "country_code3": "KEN",
    "issuer_country": "KE",
    "flag": "ðŸ‡°ðŸ‡ª",
    "currency_name": "Kenyan Shilling",
    "flag_url": "/v2/flags/ke.svg",
    "bank": {
      "read": {
        "name": "KENYA COMMERCIAL BANK",
        "country": "KE"
      },
      "match_confidence": 0.0,
      "alternatives": []
    }
  },
  {
    "network": "Visa",
    "type": "Credit",
    "level": "Platinum",
    "funding": "credit",
    "issuer": "THE CO-OPERATIVE BANK OF KENYA LTD.",
    "country": "KE",
    "currency": "KES",
    "is_commercial": false,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "409298",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "Kenya",
    "country_code3": "KEN",
    "issuer_country": "KE",
    "flag": "ðŸ‡°ðŸ‡ª",
    "currency_name": "Kenyan Shilling",
    "flag_url": "/v2/flags/ke.svg",
    "bank": {
      "read": {
        "name": "THE CO-OPERATIVE BANK OF KENYA LTD.",
        "country": "KE"
      },
      "resolved": {
        "profile_id": "bank_e7a9a91792214a20c8",
        "name": "THE CO-OPERATIVE BANK OF KENYA LTD",
        "country": "Kenya",
        "country_code": "KE",
        "city": "NAIROBI",
        "bic": "KCOOKENA",
        "logo_url": "/v2/banks/bank_e7a9a91792214a20c8/logo",
        "flag_url": "/v2/flags/ke.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [
        {
          "profile_id": "bank_4d1f8e02015197d644",
          "name": "Co-operative Bank of Kenya",
          "country": "Kenya",
          "country_code": "KE",
          "logo_url": "/v2/banks/bank_4d1f8e02015197d644/logo",
          "flag_url": "/v2/flags/ke.svg"
        }
      ],
      "name_match": 1.0
    }
  },
  {
    "network": "Mastercard",
    "type": "Debit",
    "level": "Prepaid",
    "funding": "prepaid",
    "issuer": "EQUITY BANK LTD.",
    "country": "KE",
    "currency": "KES",
    "is_commercial": false,
    "is_prepaid": true,
    "url": "http://www.equitybank.co.ke",
    "source": "local+online",
    "bin": "230027",
    "category": "consumer",
    "is_reloadable": false,
    "country_name": "Kenya",
    "country_code3": "KEN",
    "issuer_country": "KE",
    "flag": "ðŸ‡°ðŸ‡ª",
    "currency_name": "Kenyan Shilling",
    "flag_url": "/v2/flags/ke.svg",
    "bank": {
      "read": {
        "name": "EQUITY BANK LTD.",
        "country": "KE"
      },
      "resolved": {
        "profile_id": "bank_cd26414e6ad728ebea",
        "name": "EQUITY BANK (KENYA) LIMITED",
        "country": "Kenya",
        "country_code": "KE",
        "city": "NAIROBI",
        "bic": "EQBLKENA",
        "logo_url": "/v2/banks/bank_cd26414e6ad728ebea/logo",
        "flag_url": "/v2/flags/ke.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [
        {
          "profile_id": "bank_cd329b8c961d138e2a",
          "name": "Equity Bank Kenya",
          "country": "Kenya",
          "country_code": "KE",
          "logo_url": "/v2/banks/bank_cd329b8c961d138e2a/logo",
          "flag_url": "/v2/flags/ke.svg"
        }
      ],
      "name_match": 0.979
    }
  },
  {
    "network": "Visa",
    "type": "Debit",
    "level": "Classic",
    "funding": "debit",
    "issuer": "GUARANTY TRUST BANK LTD.",
    "country": "NG",
    "currency": "NGN",
    "is_commercial": false,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "403737",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "Nigeria",
    "country_code3": "NGA",
    "issuer_country": "NG",
    "flag": "ðŸ‡³ðŸ‡¬",
    "currency_name": "Naira",
    "flag_url": "/v2/flags/ng.svg",
    "bank": {
      "read": {
        "name": "GUARANTY TRUST BANK LTD.",
        "country": "NG"
      },
      "resolved": {
        "profile_id": "bank_0069d787edd282aa96",
        "name": "GUARANTY TRUST BANK PLC",
        "country": "Nigeria",
        "country_code": "NG",
        "city": "LAGOS",
        "bic": "GTBINGLA",
        "logo_url": "/v2/banks/bank_0069d787edd282aa96/logo",
        "flag_url": "/v2/flags/ng.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [
        {
          "profile_id": "bank_81880d793e2e89ce6c",
          "name": "Guaranty Trust Holding Company",
          "country": "Nigeria",
          "country_code": "NG",
          "logo_url": "/v2/banks/bank_81880d793e2e89ce6c/logo",
          "flag_url": "/v2/flags/ng.svg"
        }
      ],
      "name_match": 0.979
    }
  },
  {
    "network": "Visa",
    "type": "Credit",
    "level": "Corporate T&E",
    "funding": "credit",
    "issuer": "ZENITH BANK PLC",
    "country": "NG",
    "currency": "NGN",
    "is_commercial": true,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "402438",
    "category": "commercial",
    "is_reloadable": true,
    "country_name": "Nigeria",
    "country_code3": "NGA",
    "issuer_country": "NG",
    "flag": "ðŸ‡³ðŸ‡¬",
    "currency_name": "Naira",
    "flag_url": "/v2/flags/ng.svg",
    "bank": {
      "read": {
        "name": "ZENITH BANK PLC",
        "country": "NG"
      },
      "resolved": {
        "profile_id": "bank_32d04fcdd790d71447",
        "name": "ZENITH BANK PLC",
        "country": "Nigeria",
        "country_code": "NG",
        "city": "LAGOS",
        "bic": "ZEIBNGLA",
        "logo_url": "/v2/banks/bank_32d04fcdd790d71447/logo",
        "flag_url": "/v2/flags/ng.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [
        {
          "profile_id": "bank_3643e71053afcbfc55",
          "name": "ZENITH BANK",
          "country": "Nigeria",
          "country_code": "NG",
          "logo_url": "/v2/banks/bank_3643e71053afcbfc55/logo",
          "flag_url": "/v2/flags/ng.svg"
        },
        {
          "profile_id": "bank_acf03dff78578e55cd",
          "name": "ZENITH MOBILE",
          "country": "Nigeria",
          "country_code": "NG",
          "logo_url": "/v2/banks/bank_acf03dff78578e55cd/logo",
          "flag_url": "/v2/flags/ng.svg"
        }
      ],
      "name_match": 1.0
    }
  },
  {
    "network": "Visa",
    "type": "Credit",
    "level": "Classic",
    "funding": "credit",
    "issuer": "ABSA BANK LTD.",
    "country": "ZA",
    "currency": "ZAR",
    "is_commercial": false,
    "is_prepaid": false,
    "url": "http://www.absa.co.za",
    "source": "local+online",
    "bin": "400154",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "South Africa",
    "country_code3": "ZAF",
    "issuer_country": "ZA",
    "flag": "ðŸ‡¿ðŸ‡¦",
    "currency_name": "Rand",
    "flag_url": "/v2/flags/za.svg",
    "bank": {
      "read": {
        "name": "ABSA BANK LTD.",
        "country": "ZA"
      },
      "resolved": {
        "profile_id": "bank_055dfabaa2828afd64",
        "name": "ABSA BANK LIMITED",
        "country": "South Africa",
        "country_code": "ZA",
        "city": "JOHANNESBURG",
        "bic": "ABSAZAJJ",
        "logo_url": "/v2/banks/bank_055dfabaa2828afd64/logo",
        "flag_url": "/v2/flags/za.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [
        {
          "profile_id": "bank_d7138ae1173293ed41",
          "name": "ABSA TRUST LIMITED",
          "country": "South Africa",
          "country_code": "ZA",
          "city": "JOHANNESBURG",
          "bic": "ABTRZAJ1",
          "logo_url": "/v2/banks/bank_d7138ae1173293ed41/logo",
          "flag_url": "/v2/flags/za.svg"
        },
        {
          "profile_id": "bank_dc00e30ab6bd542c5b",
          "name": "ABSA Group Limited",
          "country": "South Africa",
          "country_code": "ZA",
          "logo_url": "/v2/banks/bank_dc00e30ab6bd542c5b/logo",
          "flag_url": "/v2/flags/za.svg"
        }
      ],
      "name_match": 0.989
    }
  },
  {
    "network": "Visa",
    "type": "Debit",
    "level": "Business",
    "funding": "debit",
    "issuer": "CAPITEC BANK LTD.",
    "country": "ZA",
    "currency": "ZAR",
    "is_commercial": true,
    "is_prepaid": false,
    "url": "http://www.capitecbank.co.za",
    "source": "local+online",
    "bin": "401600",
    "category": "commercial",
    "is_reloadable": true,
    "country_name": "South Africa",
    "country_code3": "ZAF",
    "issuer_country": "ZA",
    "flag": "ðŸ‡¿ðŸ‡¦",
    "currency_name": "Rand",
    "flag_url": "/v2/flags/za.svg",
    "bank": {
      "read": {
        "name": "CAPITEC BANK LTD.",
        "country": "ZA"
      },
      "resolved": {
        "profile_id": "bank_6a9e3897c95de75bfd",
        "name": "CAPITEC BANK LIMITED",
        "country": "South Africa",
        "country_code": "ZA",
        "city": "STELLENBOSCH",
        "bic": "CABLZAJJ",
        "logo_url": "/v2/banks/bank_6a9e3897c95de75bfd/logo",
        "flag_url": "/v2/flags/za.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [
        {
          "profile_id": "bank_37d2dacac8afd35d76",
          "name": "Capitec Bank",
          "country": "South Africa",
          "country_code": "ZA",
          "logo_url": "/v2/banks/bank_37d2dacac8afd35d76/logo",
          "flag_url": "/v2/flags/za.svg"
        }
      ],
      "name_match": 0.991
    }
  },
  {
    "network": "Visa",
    "type": "Debit",
    "level": "Business",
    "funding": "debit",
    "issuer": "FIRSTRAND BANK LTD.",
    "country": "ZA",
    "currency": "ZAR",
    "is_commercial": true,
    "is_prepaid": false,
    "url": "http://www.firstrand.co.za",
    "source": "local+online",
    "bin": "400568",
    "category": "commercial",
    "is_reloadable": true,
    "country_name": "South Africa",
    "country_code3": "ZAF",
    "issuer_country": "ZA",
    "flag": "ðŸ‡¿ðŸ‡¦",
    "currency_name": "Rand",
    "flag_url": "/v2/flags/za.svg",
    "bank": {
      "read": {
        "name": "FIRSTRAND BANK LTD.",
        "country": "ZA"
      },
      "resolved": {
        "profile_id": "bank_f17e74a3b7d852101c",
        "name": "FIRSTRAND BANK LIMITED",
        "country": "South Africa",
        "country_code": "ZA",
        "city": "SANDTON",
        "bic": "FIRNZAJJ",
        "logo_url": "/v2/banks/bank_f17e74a3b7d852101c/logo",
        "flag_url": "/v2/flags/za.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [],
      "name_match": 0.99
    }
  },
  {
    "network": "Visa",
    "type": "Debit",
    "level": "Platinum",
    "funding": "debit",
    "issuer": "ECOBANK GHANA LTD.",
    "country": "GH",
    "currency": "GHS",
    "is_commercial": false,
    "is_prepaid": false,
    "url": "http://www.ecobank.com",
    "source": "local+online",
    "bin": "400963",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "Ghana",
    "country_code3": "GHA",
    "issuer_country": "GH",
    "flag": "ðŸ‡¬ðŸ‡­",
    "currency_name": "Ghana Cedi",
    "flag_url": "/v2/flags/gh.svg",
    "bank": {
      "read": {
        "name": "ECOBANK GHANA LTD.",
        "country": "GH"
      },
      "resolved": {
        "profile_id": "bank_72d0f9656b02ccb2c1",
        "name": "ECOBANK GHANA",
        "country": "Ghana",
        "country_code": "GH",
        "city": "ACCRA",
        "bic": "ECOCGHAC",
        "logo_url": "/v2/banks/bank_72d0f9656b02ccb2c1/logo",
        "flag_url": "/v2/flags/gh.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [
        {
          "profile_id": "bank_e4397a2f2f95e57c7b",
          "name": "Ecobank Ghana",
          "country": "Ghana",
          "country_code": "GH",
          "logo_url": "/v2/banks/bank_e4397a2f2f95e57c7b/logo",
          "flag_url": "/v2/flags/gh.svg"
        },
        {
          "profile_id": "bank_9c64e62f209d658fc1",
          "name": "Ecobank Ghana PLC",
          "country": "Ghana",
          "country_code": "GH",
          "logo_url": "/v2/banks/bank_9c64e62f209d658fc1/logo",
          "flag_url": "/v2/flags/gh.svg"
        }
      ],
      "name_match": 0.99
    }
  },
  {
    "network": "Visa",
    "type": "Debit",
    "level": "Gold",
    "funding": "debit",
    "issuer": "STANBIC BANK UGANDA LTD.",
    "country": "UG",
    "currency": "UGX",
    "is_commercial": false,
    "is_prepaid": false,
    "url": "http://www.stanbicbank.co.ug",
    "source": "local+online",
    "bin": "406918",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "Uganda",
    "country_code3": "UGA",
    "issuer_country": "UG",
    "flag": "ðŸ‡ºðŸ‡¬",
    "currency_name": "Uganda Shilling",
    "flag_url": "/v2/flags/ug.svg",
    "bank": {
      "read": {
        "name": "STANBIC BANK UGANDA LTD.",
        "country": "UG"
      },
      "resolved": {
        "profile_id": "bank_2ff6b032cff0702565",
        "name": "STANBIC BANK UGANDA LIMITED",
        "country": "Uganda",
        "country_code": "UG",
        "city": "KAMPALA",
        "bic": "SBICUGKX",
        "logo_url": "/v2/banks/bank_2ff6b032cff0702565/logo",
        "flag_url": "/v2/flags/ug.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [
        {
          "profile_id": "bank_02a3597f337617b22d",
          "name": "Stanbic Bank Uganda Limited",
          "country": "Uganda",
          "country_code": "UG",
          "logo_url": "/v2/banks/bank_02a3597f337617b22d/logo",
          "flag_url": "/v2/flags/ug.svg"
        }
      ],
      "name_match": 0.987
    }
  },
  {
    "network": "Visa",
    "type": "Debit",
    "level": "Gold",
    "funding": "debit",
    "issuer": "CRDB BANK LTD.",
    "country": "TZ",
    "currency": "TZS",
    "is_commercial": false,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "402662",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "Tanzania",
    "country_code3": "TZA",
    "issuer_country": "TZ",
    "flag": "ðŸ‡¹ðŸ‡¿",
    "currency_name": "Tanzanian Shilling",
    "flag_url": "/v2/flags/tz.svg",
    "bank": {
      "read": {
        "name": "CRDB BANK LTD.",
        "country": "TZ"
      },
      "resolved": {
        "profile_id": "bank_0624f91d24cb135769",
        "name": "CRDB BANK LIMITED",
        "country": "Tanzania",
        "country_code": "TZ",
        "city": "DAR ES SALAAM",
        "bic": "CORUTZT10T2",
        "logo_url": "/v2/banks/bank_0624f91d24cb135769/logo",
        "flag_url": "/v2/flags/tz.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [
        {
          "profile_id": "bank_259ee56236d2268a6a",
          "name": "CRDB BANK LIMITED",
          "country": "Tanzania",
          "country_code": "TZ",
          "city": "DAR ES SALAAM",
          "bic": "CORUTZTZ",
          "logo_url": "/v2/banks/bank_259ee56236d2268a6a/logo",
          "flag_url": "/v2/flags/tz.svg"
        },
        {
          "profile_id": "bank_be8b6e9bd50cd2daa7",
          "name": "CRDB Bank",
          "country": "Tanzania",
          "country_code": "TZ",
          "logo_url": "/v2/banks/bank_be8b6e9bd50cd2daa7/logo",
          "flag_url": "/v2/flags/tz.svg"
        }
      ],
      "name_match": 0.99
    }
  },
  {
    "network": "Visa",
    "type": "Debit",
    "level": "Prepaid Classic",
    "funding": "prepaid",
    "issuer": "NATIONAL BANK OF EGYPT",
    "country": "EG",
    "currency": "EGP",
    "is_commercial": false,
    "is_prepaid": true,
    "url": "http://www.nbe.com.eg",
    "source": "local+online",
    "bin": "411739",
    "category": "consumer",
    "is_reloadable": false,
    "country_name": "Egypt",
    "country_code3": "EGY",
    "issuer_country": "EG",
    "flag": "ðŸ‡ªðŸ‡¬",
    "currency_name": "Egyptian Pound",
    "flag_url": "/v2/flags/eg.svg",
    "bank": {
      "read": {
        "name": "NATIONAL BANK OF EGYPT",
        "country": "EG"
      },
      "match_confidence": 0.0,
      "alternatives": []
    }
  },
  {
    "network": "Mastercard",
    "type": "Debit",
    "level": "Prepaid Business",
    "funding": "prepaid",
    "issuer": "ATTIJARIWAFA BANK",
    "country": "MA",
    "currency": "MAD",
    "is_commercial": true,
    "is_prepaid": true,
    "url": "http://www.attijariwafabank.com",
    "source": "local+online",
    "bin": "229247",
    "category": "commercial",
    "is_reloadable": false,
    "country_name": "Morocco",
    "country_code3": "MAR",
    "issuer_country": "MA",
    "flag": "ðŸ‡²ðŸ‡¦",
    "currency_name": "Moroccan Dirham",
    "flag_url": "/v2/flags/ma.svg",
    "bank": {
      "read": {
        "name": "ATTIJARIWAFA BANK",
        "country": "MA"
      },
      "resolved": {
        "profile_id": "bank_3541575de785494abd",
        "name": "Attijariwafa Bank",
        "country": "Morocco",
        "country_code": "MA",
        "logo_url": "/v2/banks/bank_3541575de785494abd/logo",
        "flag_url": "/v2/flags/ma.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [],
      "name_match": 1.0
    }
  },
  {
    "network": "Mastercard",
    "type": "Debit",
    "level": "Prepaid Platinum Travel",
    "funding": "prepaid",
    "issuer": "REVOLUT LTD.",
    "country": "IE",
    "currency": "EUR",
    "is_commercial": false,
    "is_prepaid": true,
    "source": "local+online",
    "bin": "539123",
    "category": "consumer",
    "is_reloadable": false,
    "country_name": "Ireland",
    "country_code3": "IRL",
    "issuer_country": "IE",
    "flag": "ðŸ‡®ðŸ‡ª",
    "currency_name": "Euro",
    "flag_url": "/v2/flags/ie.svg",
    "bank": {
      "read": {
        "name": "REVOLUT LTD.",
        "country": "IE"
      },
      "resolved": {
        "profile_id": "bank_9dc7833cee50265ddb",
        "name": "Revolut Bank UAB",
        "country": "Ireland",
        "country_code": "IE",
        "city": "Dublin",
        "address": "2 Dublin Landings",
        "parent": "Revolut Bank UAB",
        "status": "active",
        "flag_url": "/v2/flags/ie.svg"
      },
      "match_confidence": 0.778,
      "alternatives": [],
      "name_match": 0.812
    }
  },
  {
    "network": "Mastercard",
    "type": "Debit",
    "level": "World Elite",
    "funding": "debit",
    "issuer": "REVOLUT LTD.",
    "country": "IE",
    "currency": "EUR",
    "is_commercial": false,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "516794",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "Ireland",
    "country_code3": "IRL",
    "issuer_country": "IE",
    "flag": "ðŸ‡®ðŸ‡ª",
    "currency_name": "Euro",
    "flag_url": "/v2/flags/ie.svg",
    "bank": {
      "read": {
        "name": "REVOLUT LTD.",
        "country": "IE"
      },
      "resolved": {
        "profile_id": "bank_9dc7833cee50265ddb",
        "name": "Revolut Bank UAB",
        "country": "Ireland",
        "country_code": "IE",
        "city": "Dublin",
        "address": "2 Dublin Landings",
        "parent": "Revolut Bank UAB",
        "status": "active",
        "flag_url": "/v2/flags/ie.svg"
      },
      "match_confidence": 0.778,
      "alternatives": [],
      "name_match": 0.812
    }
  },
  {
    "network": "Mastercard",
    "type": "Debit",
    "level": "World",
    "funding": "debit",
    "issuer": "MONZO BANK LTD.",
    "country": "GB",
    "currency": "GBP",
    "is_commercial": false,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "535522",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "United Kingdom",
    "country_code3": "GBR",
    "issuer_country": "GB",
    "flag": "ðŸ‡¬ðŸ‡§",
    "currency_name": "Pound Sterling",
    "flag_url": "/v2/flags/gb.svg",
    "bank": {
      "read": {
        "name": "MONZO BANK LTD.",
        "country": "GB"
      },
      "resolved": {
        "profile_id": "bank_d2a05d9e84ed5d650b",
        "name": "MONZO BANK LIMITED",
        "country": "United Kingdom",
        "country_code": "GB",
        "city": "LONDON",
        "bic": "MONZGB21",
        "logo_url": "/v2/banks/bank_d2a05d9e84ed5d650b/logo",
        "flag_url": "/v2/flags/gb.svg"
      },
      "match_confidence": 1.0,
      "alternatives": [
        {
          "profile_id": "bank_4e686cf1f1ecb956c7",
          "name": "Monzo",
          "country": "United Kingdom",
          "country_code": "GB",
          "logo_url": "/v2/banks/bank_4e686cf1f1ecb956c7/logo",
          "flag_url": "/v2/flags/gb.svg"
        }
      ],
      "name_match": 0.99
    }
  },
  {
    "network": "Visa",
    "type": "Credit",
    "level": "Traditional",
    "funding": "credit",
    "issuer": "BANK OF AMERICA - CONSUMER CREDIT",
    "country": "US",
    "currency": "USD",
    "is_commercial": false,
    "is_prepaid": false,
    "source": "local+online",
    "bin": "402400",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "United States",
    "country_code3": "USA",
    "issuer_country": "US",
    "flag": "ðŸ‡ºðŸ‡¸",
    "currency_name": "US Dollar",
    "flag_url": "/v2/flags/us.svg",
    "bank": {
      "read": {
        "name": "BANK OF AMERICA - CONSUMER CREDIT",
        "country": "US"
      },
      "resolved": {
        "profile_id": "bank_866a663a0e019119ef",
        "name": "BANK OF AMERICA, N.A",
        "country": "United States",
        "country_code": "US",
        "city": "CHARLOTTE,NC",
        "bic": "BOFAUSV1",
        "logo_url": "/v2/banks/bank_866a663a0e019119ef/logo",
        "flag_url": "/v2/flags/us.svg"
      },
      "match_confidence": 0.72,
      "alternatives": [
        {
          "profile_id": "bank_163598ebcb9a7dfe6f",
          "name": "BANK OF AMERICA, N.A.",
          "country": "United States",
          "country_code": "US",
          "city": "MIAMI,FL",
          "bic": "BOFAUS3M",
          "logo_url": "/v2/banks/bank_163598ebcb9a7dfe6f/logo",
          "flag_url": "/v2/flags/us.svg"
        },
        {
          "profile_id": "bank_2bda945ce7625907e4",
          "name": "BANK OF AMERICA, N.A.",
          "country": "United States",
          "country_code": "US",
          "city": "NEW YORK,NY",
          "bic": "BOFAUS3N",
          "logo_url": "/v2/banks/bank_2bda945ce7625907e4/logo",
          "flag_url": "/v2/flags/us.svg"
        },
        {
          "profile_id": "bank_5951abd27750995c0b",
          "name": "BANK OF AMERICA, N.A.",
          "country": "United States",
          "country_code": "US",
          "city": "SAN FRANCISCO,CA",
          "bic": "BOFAUS6H",
          "logo_url": "/v2/banks/bank_5951abd27750995c0b/logo",
          "flag_url": "/v2/flags/us.svg"
        }
      ],
      "name_match": 0.998
    }
  },
  {
    "network": "American Express",
    "type": "Credit",
    "level": "Personal",
    "funding": "credit",
    "issuer": "BANK OF AMERICA",
    "country": "US",
    "currency": "USD",
    "is_commercial": false,
    "is_prepaid": false,
    "phone": "+18004321000",
    "url": "http://www.bankofamerica.com",
    "source": "local+online",
    "bin": "374314",
    "category": "consumer",
    "is_reloadable": true,
    "country_name": "United States",
    "country_code3": "USA",
    "issuer_country": "US",
    "flag": "ðŸ‡ºðŸ‡¸",
    "currency_name": "US Dollar",
    "flag_url": "/v2/flags/us.svg",
    "bank": {
      "read": {
        "name": "BANK OF AMERICA",
        "country": "US"
      },
      "match_confidence": 0.0,
      "alternatives": [
        {
          "profile_id": "bank_850c01461b04db5e4d",
          "name": "AMERICA'S",
          "country": "United States",
          "country_code": "US",
          "city": "GARLAND",
          "address": "PO BOX 469046",
          "logo_url": "/v2/banks/bank_850c01461b04db5e4d/logo",
          "flag_url": "/v2/flags/us.svg"
        },
        {
          "profile_id": "bank_9850876321c8219a6c",
          "name": "AMERICA'S CREDIT UNION, A",
          "country": "United States",
          "country_code": "US",
          "city": "DuPont",
          "address": "P.O. Box 5060",
          "logo_url": "/v2/banks/bank_9850876321c8219a6c/logo",
          "flag_url": "/v2/flags/us.svg"
        },
        {
          "profile_id": "bank_0dda83159fac804365",
          "name": "BANK OF AMERICA CORPORATION",
          "country": "United States",
          "country_code": "US",
          "city": "CHARLOTTE,NC",
          "bic": "MLCOUS33",
          "flag_url": "/v2/flags/us.svg"
        },
        {
          "profile_id": "bank_4ac8d79e52b9442127",
          "name": "BANK OF AMERICA CORPORATION",
          "country": "United States",
          "country_code": "US",
          "city": "NEW YORK,NY",
          "bic": "MLCOUS3G",
          "flag_url": "/v2/flags/us.svg"
        }
      ],
      "name_match": 0.0
    }
  }
];
