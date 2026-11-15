/**
 * Real example responses of the focused APIs, captured from the running MICR and
 * Card services on 2026-10-07 for the sample images in public/finance/samples
 * (and the sample Visa card's number). Shown in the API Playground before a run.
 * Generated, not hand-written: re-capture, don't edit.
 */

export const micrLine = {
  "object": "micr_line",
  "status": "read",
  "lines_found": 1,
  "processing_ms": 430,
  "line": {
    "text": "C370694CA102000979A68008192429291C",
    "printed": "â‘ˆ370694â‘ˆâ‘†102000979â‘†68008192429291â‘ˆ",
    "font": "E-13B",
    "confidence": 88.0,
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
    ]
  },
  "fields": [
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
};

export const chequeAmount = {
  "object": "cheque_amount",
  "figures": "4,280.80",
  "words": "FOUR THOUSAND TWO HUNDRED EIGHTY AND 80/100 CENTS",
  "numeric": 4280.8,
  "agreement": true,
  "currency": {
    "code": "USD",
    "name": "US Dollar",
    "symbol": "$"
  },
  "processing_ms": 1860
};

export const chequeDate = {
  "object": "cheque_date",
  "raw": "23/7/1020",
  "iso": "2023-07-10",
  "age_days": 1185,
  "post_dated": false,
  "processing_ms": 1821
};

export const chequeParties = {
  "object": "cheque_parties",
  "payee": "Sgt Jonathan Hanson",
  "drawer": "Barbara A. Wright",
  "processing_ms": 2224
};

export const chequeBank = {
  "object": "cheque_bank",
  "read": {
    "name": "National City Bank",
    "branch": "National City Bank",
    "address": "JPMorgan Chase Bank, N.A., Denver Colorado",
    "country": "US"
  },
  "country": {
    "code": "US",
    "name": "United States",
    "flag": "ðŸ‡ºðŸ‡¸",
    "flag_url": "/v2/flags/us.svg"
  },
  "processing_ms": 1862
};

export const bankLookup = {
  "object": "bank_lookup",
  "query": {
    "name": "Stanbic Bank",
    "country": "UG"
  },
  "bank": {
    "profile_id": "bank_2ff6b032cff0702565",
    "name": "STANBIC BANK UGANDA LIMITED",
    "country": "Uganda",
    "country_code": "UG",
    "city": "KAMPALA",
    "bic": "SBICUGKX",
    "logo_url": "/v2/banks/bank_2ff6b032cff0702565/logo",
    "flag_url": "/v2/flags/ug.svg"
  },
  "name_match": 0.993,
  "verified": true,
  "alternatives": [
    {
      "profile_id": "bank_02a3597f337617b22d",
      "name": "Stanbic Bank Uganda Limited",
      "country": "Uganda",
      "country_code": "UG",
      "logo_url": "/v2/banks/bank_02a3597f337617b22d/logo",
      "flag_url": "/v2/flags/ug.svg"
    }
  ]
};

export const cardNumber = {
  "object": "card_number",
  "status": "read",
  "processing_ms": 920,
  "number": "4713768012956464",
  "first6": "471376",
  "last4": "6464",
  "length": 16,
  "network": "Visa",
  "luhn_valid": true,
  "scheme_valid": true,
  "confidence": 87.9
};

export const cardExpiry = {
  "object": "card_expiry",
  "status": "read",
  "valid_thru": "02/29",
  "expired": false,
  "expires_in_days": 875,
  "expiry_status": "valid",
  "confidence": 86.9,
  "processing_ms": 1251
};

export const cardCheck = {
  "object": "card_check",
  "first6": "471376",
  "last4": "6464",
  "length": 16,
  "network": "Visa",
  "luhn_valid": true,
  "length_valid": true,
  "scheme_valid": true,
  "expired": false,
  "expires_in_days": 875,
  "expiry_status": "valid",
  "bin": {
    "bin": "471376",
    "network": "Visa",
    "type": "Debit",
    "level": "Classic",
    "funding": "debit",
    "issuer": "BANK OF KIGALI LTD.",
    "country": "RW",
    "country_name": "Rwanda",
    "flag": "ðŸ‡·ðŸ‡¼",
    "flag_url": "/v2/flags/rw.svg",
    "currency": "RWF",
    "is_prepaid": false,
    "is_commercial": false
  }
};

export const cardFingerprint = {
  "object": "card_fingerprint",
  "fingerprint": "cf_ea41ca988a74794884e4c242",
  "first6": "471376",
  "last4": "6464"
};

export const binLookup = {
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
};
