"""Offline geo/currency enrichment for BIN rows.

country name + ISO3 + currency NAME come from `pycountry` (offline dataset);
country -> currency CODE is a static ISO 3166 -> ISO 4217 table (pycountry does
not link the two). This lets EVERY local row gain a full country name, a flag
(the UI renders it from the ISO2 code) and the issuing currency without any
online call. The online tier still overrides these with the provider's own
values when it fires.
"""

from __future__ import annotations

from functools import lru_cache

try:
    import pycountry
except Exception:  # pragma: no cover - pycountry always present in the venv
    pycountry = None

# ISO 3166-1 alpha-2 -> ISO 4217 currency alpha-3. Covers the real card markets.
_CC = (
    "AD:EUR AE:AED AF:AFN AG:XCD AI:XCD AL:ALL AM:AMD AO:AOA AR:ARS AT:EUR AU:AUD AW:AWG AX:EUR AZ:AZN "
    "BA:BAM BB:BBD BD:BDT BE:EUR BF:XOF BG:BGN BH:BHD BI:BIF BJ:XOF BM:BMD BN:BND BO:BOB BR:BRL BS:BSD "
    "BT:BTN BW:BWP BY:BYN BZ:BZD CA:CAD CD:CDF CF:XAF CG:XAF CH:CHF CI:XOF CL:CLP CM:XAF CN:CNY CO:COP "
    "CR:CRC CU:CUP CV:CVE CW:ANG CY:EUR CZ:CZK DE:EUR DJ:DJF DK:DKK DM:XCD DO:DOP DZ:DZD EC:USD EE:EUR "
    "EG:EGP ER:ERN ES:EUR ET:ETB FI:EUR FJ:FJD FM:USD FO:DKK FR:EUR GA:XAF GB:GBP GD:XCD GE:GEL GH:GHS "
    "GI:GIP GM:GMD GN:GNF GQ:XAF GR:EUR GT:GTQ GW:XOF GY:GYD HK:HKD HN:HNL HR:EUR HT:HTG HU:HUF ID:IDR "
    "IE:EUR IL:ILS IM:GBP IN:INR IQ:IQD IR:IRR IS:ISK IT:EUR JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR "
    "KM:KMF KN:XCD KR:KRW KW:KWD KY:KYD KZ:KZT LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR "
    "LU:EUR LV:EUR LY:LYD MA:MAD MC:EUR MD:MDL ME:EUR MG:MGA MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MQ:EUR "
    "MR:MRU MT:EUR MU:MUR MV:MVR MW:MWK MX:MXN MY:MYR MZ:MZN NA:NAD NC:XPF NE:XOF NG:NGN NI:NIO NL:EUR "
    "NO:NOK NP:NPR NZ:NZD OM:OMR PA:PAB PE:PEN PF:XPF PG:PGK PH:PHP PK:PKR PL:PLN PR:USD PS:ILS PT:EUR "
    "PY:PYG QA:QAR RO:RON RS:RSD RU:RUB RW:RWF SA:SAR SB:SBD SC:SCR SD:SDG SE:SEK SG:SGD SI:EUR SK:EUR "
    "SL:SLE SM:EUR SN:XOF SO:SOS SR:SRD SS:SSP ST:STN SV:USD SY:SYP SZ:SZL TC:USD TD:XAF TG:XOF TH:THB "
    "TJ:TJS TL:USD TM:TMT TN:TND TO:TOP TR:TRY TT:TTD TW:TWD TZ:TZS UA:UAH UG:UGX US:USD UY:UYU UZ:UZS "
    "VA:EUR VC:XCD VE:VES VG:USD VI:USD VN:VND VU:VUV WS:WST XK:EUR YE:YER ZA:ZAR ZM:ZMW ZW:ZWG"
)
COUNTRY_CURRENCY: dict[str, str] = dict(pair.split(":") for pair in _CC.split())


@lru_cache(maxsize=512)
def country_name(iso2: str | None) -> str | None:
    if not iso2:
        return None
    if pycountry:
        c = pycountry.countries.get(alpha_2=iso2.upper())
        if c:
            # Prefer the short common name when present (e.g. "Bolivia").
            return getattr(c, "common_name", None) or c.name
    return iso2


@lru_cache(maxsize=512)
def country_iso3(iso2: str | None) -> str | None:
    if not iso2:
        return None
    if pycountry:
        c = pycountry.countries.get(alpha_2=iso2.upper())
        if c:
            return c.alpha_3
    return None


def currency_for_country(iso2: str | None) -> str | None:
    return COUNTRY_CURRENCY.get(iso2.upper()) if iso2 else None


@lru_cache(maxsize=512)
def currency_name(alpha3: str | None) -> str | None:
    if not alpha3:
        return None
    if pycountry:
        c = pycountry.currencies.get(alpha_3=alpha3.upper())
        if c:
            return c.name
    return None


@lru_cache(maxsize=1)
def _numeric_map() -> dict[str, str]:
    m: dict[str, str] = {}
    if pycountry:
        for cur in pycountry.currencies:
            num = getattr(cur, "numeric", None)
            if num:
                m[str(num).zfill(3)] = cur.alpha_3
    return m


def currency_from_numeric(numeric: str | None) -> str | None:
    """ISO 4217 numeric (e.g. '646') -> alpha ('RWF'). Used for datasets that
    store the numeric currency (the ultimate-2026 sample does)."""
    if not numeric:
        return None
    return _numeric_map().get(str(numeric).strip().zfill(3))
