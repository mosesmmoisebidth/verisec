/**
 * The kind of identity document the reader actually saw, taken from its own classification (never from what the
 * applicant's browser says it chose). The browser's flow does the same reading for its screens
 * (frontend/src/lib/verify/idv/analyze.ts categoryOf); the server decides with this one.
 */
import type { DocumentType } from './workflows';

// the reader's document type codes (the same table the browser's flow uses: frontend/src/lib/verify/idv/enums.ts)
const ENGINE_DOCUMENT_TYPES: Record<number, string> = {
  0: "NOT_DEFINED",
  11: "PASSPORT",
  12: "IDENTITY_CARD",
  13: "DIPLOMATIC_PASSPORT",
  14: "SERVICE_PASSPORT",
  15: "SEAMANS_IDENTITY_DOCUMENT",
  16: "IDENTITY_CARD_FOR_RESIDENCE",
  17: "TRAVEL_DOCUMENT",
  20: "NATIONAL_IDENTITY_CARD",
  21: "SOCIAL_IDENTITY_CARD",
  22: "ALIENS_IDENTITY_CARD",
  23: "PRIVILEGED_IDENTITY_CARD",
  24: "RESIDENCE_PERMIT_IDENTITY_CARD",
  25: "ORIGIN_CARD",
  26: "EMERGENCY_PASSPORT",
  27: "ALIENS_PASSPORT",
  28: "ALTERNATIVE_IDENTITY_CARD",
  29: "VISA_ID2",
  30: "VISA_ID3",
  32: "AUTHORIZATION_CARD",
  33: "BEGINNER_PERMIT",
  34: "BORDER_CROSSING_CARD",
  35: "CHAUFFEUR_LICENSE",
  36: "CHAUFFEUR_LICENSE_UNDER_18",
  37: "CHAUFFEUR_LICENSE_UNDER_21",
  38: "COMMERCIAL_DRIVING_LICENSE",
  39: "COMMERCIAL_DRIVING_LICENSE_INSTRUCTIONAL_PERMIT",
  40: "COMMERCIAL_DRIVING_LICENSE_UNDER_18",
  41: "COMMERCIAL_DRIVING_LICENSE_UNDER_21",
  42: "COMMERCIAL_INSTRUCTION_PERMIT",
  43: "COMMERCIAL_NEW_PERMIT",
  44: "CONCEALED_CARRY_LICENSE",
  45: "CONCEALED_FIREARM_PERMIT",
  46: "CONDITIONAL_DRIVING_LICENSE",
  47: "DEPARTMENT_OF_VETERANS_AFFAIRS_IDENTITY_CARD",
  48: "DIPLOMATIC_DRIVING_LICENSE",
  49: "DRIVING_LICENSE",
  50: "DRIVING_LICENSE_INSTRUCTIONAL_PERMIT",
  51: "DRIVING_LICENSE_INSTRUCTIONAL_PERMIT_UNDER_18",
  52: "DRIVING_LICENSE_INSTRUCTIONAL_PERMIT_UNDER_21",
  53: "DRIVING_LICENSE_LEARNERS_PERMIT",
  54: "DRIVING_LICENSE_LEARNERS_PERMIT_UNDER_18",
  55: "DRIVING_LICENSE_LEARNERS_PERMIT_UNDER_21",
  56: "DRIVING_LICENSE_NOVICE",
  57: "DRIVING_LICENSE_NOVICE_UNDER_18",
  58: "DRIVING_LICENSE_NOVICE_UNDER_21",
  59: "DRIVING_LICENSE_REGISTERED_OFFENDER",
  60: "DRIVING_LICENSE_RESTRICTED_UNDER_18",
  61: "DRIVING_LICENSE_RESTRICTED_UNDER_21",
  62: "DRIVING_LICENSE_TEMPORARY_VISITOR",
  63: "DRIVING_LICENSE_TEMPORARY_VISITOR_UNDER_18",
  64: "DRIVING_LICENSE_TEMPORARY_VISITOR_UNDER_21",
  65: "DRIVING_LICENSE_UNDER_18",
  66: "DRIVING_LICENSE_UNDER_21",
  67: "EMPLOYMENT_DRIVING_PERMIT",
  68: "ENHANCED_CHAUFFEUR_LICENSE",
  69: "ENHANCED_CHAUFFEUR_LICENSE_UNDER_18",
  70: "ENHANCED_CHAUFFEUR_LICENSE_UNDER_21",
  71: "ENHANCED_COMMERCIAL_DRIVING_LICENSE",
  72: "ENHANCED_DRIVING_LICENSE",
  73: "ENHANCED_DRIVING_LICENSE_UNDER_18",
  74: "ENHANCED_DRIVING_LICENSE_UNDER_21",
  75: "ENHANCED_IDENTITY_CARD",
  76: "ENHANCED_IDENTITY_CARD_UNDER_18",
  77: "ENHANCED_IDENTITY_CARD_UNDER_21",
  78: "ENHANCED_OPERATORS_LICENSE",
  79: "FIREARMS_PERMIT",
  80: "FULL_PROVISIONAL_LICENSE",
  81: "FULL_PROVISIONAL_LICENSE_UNDER_18",
  82: "FULL_PROVISIONAL_LICENSE_UNDER_21",
  83: "GENEVA_CONVENTIONS_IDENTITY_CARD",
  84: "GRADUATED_DRIVING_LICENSE_UNDER_18",
  85: "GRADUATED_DRIVING_LICENSE_UNDER_21",
  86: "GRADUATED_INSTRUCTION_PERMIT_UNDER_18",
  87: "GRADUATED_INSTRUCTION_PERMIT_UNDER_21",
  88: "GRADUATED_LICENSE_UNDER_18",
  89: "GRADUATED_LICENSE_UNDER_21",
  90: "HANDGUN_CARRY_PERMIT",
  91: "IDENTITY_AND_PRIVILEGE_CARD",
  92: "IDENTITY_CARD_MOBILITY_IMPAIRED",
  93: "IDENTITY_CARD_REGISTERED_OFFENDER",
  94: "IDENTITY_CARD_TEMPORARY_VISITOR",
  95: "IDENTITY_CARD_TEMPORARY_VISITOR_UNDER_18",
  96: "IDENTITY_CARD_TEMPORARY_VISITOR_UNDER_21",
  97: "IDENTITY_CARD_UNDER_18",
  98: "IDENTITY_CARD_UNDER_21",
  99: "OTHER",
  100: "IGNITION_INTERLOCK_PERMIT",
  101: "IMMIGRANT_VISA",
  102: "INSTRUCTION_PERMIT",
  103: "INSTRUCTION_PERMIT_UNDER_18",
  104: "INSTRUCTION_PERMIT_UNDER_21",
  105: "INTERIM_DRIVING_LICENSE",
  106: "INTERIM_IDENTITY_CARD",
  107: "INTERMEDIATE_DRIVING_LICENSE",
  108: "INTERMEDIATE_DRIVING_LICENSE_UNDER_18",
  109: "INTERMEDIATE_DRIVING_LICENSE_UNDER_21",
  110: "JUNIOR_DRIVING_LICENSE",
  111: "LEARNER_INSTRUCTIONAL_PERMIT",
  112: "LEARNER_LICENSE",
  113: "LEARNER_LICENSE_UNDER_18",
  114: "LEARNER_LICENSE_UNDER_21",
  115: "LEARNER_PERMIT",
  116: "LEARNER_PERMIT_UNDER_18",
  117: "LEARNER_PERMIT_UNDER_21",
  118: "LIMITED_LICENSE",
  119: "LIMITED_PERMIT",
  120: "LIMITED_TERM_DRIVING_LICENSE",
  121: "LIMITED_TERM_IDENTITY_CARD",
  122: "LIQUOR_IDENTITY_CARD",
  123: "NEW_PERMIT",
  124: "NEW_PERMIT_UNDER_18",
  125: "NEW_PERMIT_UNDER_21",
  126: "NON_US_CITIZEN_DRIVING_LICENSE",
  127: "OCCUPATIONAL_DRIVING_LICENSE",
  128: "ONEIDA_TRIBE_OF_INDIANS_IDENTITY_CARD",
  129: "OPERATOR_LICENSE",
  130: "OPERATOR_LICENSE_UNDER_18",
  131: "OPERATOR_LICENSE_UNDER_21",
  132: "PERMANENT_DRIVING_LICENSE",
  133: "PERMIT_TO_REENTER",
  134: "PROBATIONARY_AUTO_LICENSE",
  135: "PROBATIONARY_DRIVING_LICENSE_UNDER_18",
  136: "PROBATIONARY_DRIVING_LICENSE_UNDER_21",
  137: "PROBATIONARY_VEHICLE_SALES_PERSON_LICENSE",
  138: "PROVISIONAL_DRIVING_LICENSE",
  139: "PROVISIONAL_DRIVING_LICENSE_UNDER_18",
  140: "PROVISIONAL_DRIVING_LICENSE_UNDER_21",
  141: "PROVISIONAL_LICENSE",
  142: "PROVISIONAL_LICENSE_UNDER_18",
  143: "PROVISIONAL_LICENSE_UNDER_21",
  144: "PUBLIC_PASSENGER_CHAUFFEUR_LICENSE",
  145: "RACING_AND_GAMING_COMISSION_CARD",
  146: "REFUGEE_TRAVEL_DOCUMENT",
  147: "RENEWAL_PERMIT",
  148: "RESTRICTED_COMMERCIAL_DRIVER_LICENSE",
  149: "RESTRICTED_DRIVER_LICENSE",
  150: "RESTRICTED_PERMIT",
  151: "SEASONAL_PERMIT",
  152: "SEASONAL_RESIDENT_IDENTITY_CARD",
  153: "SEASONAL_CITIZEN_IDENTITY_CARD",
  154: "SEX_OFFENDER",
  155: "SOCIAL_SECURITY_CARD",
  156: "TEMPORARY_DRIVING_LICENSE",
  157: "TEMPORARY_DRIVING_LICENSE_UNDER_18",
  158: "TEMPORARY_DRIVING_LICENSE_UNDER_21",
  159: "TEMPORARY_IDENTITY_CARD",
  160: "TEMPORARY_INSTRUCTION_PERMIT_IDENTITY_CARD",
  161: "TEMPORARY_INSTRUCTION_PERMIT_IDENTITY_CARD_UNDER_18",
  162: "TEMPORARY_INSTRUCTION_PERMIT_IDENTITY_CARD_UNDER_21",
  163: "TEMPORARY_VISITOR_DRIVING_LICENSE",
  164: "TEMPORARY_VISITOR_DRIVING_LICENSE_UNDER_18",
  165: "TEMPORARY_VISITOR_DRIVING_LICENSE_UNDER_21",
  166: "UNIFORMED_SERVICES_IDENTITY_CARD",
  167: "VEHICLE_SALES_PERSON_LICENSE",
  168: "WORKER_IDENTIFICATION_CREDENTIAL",
  169: "COMMERCIAL_DRIVING_LICENSE_NOVICE",
  170: "COMMERCIAL_DRIVING_LICENSE_NOVICE_UNDER_18",
  171: "COMMERCIAL_DRIVING_LICENSE_NOVICE_UNDER_21",
  172: "PASSPORT_CARD",
  173: "PASSPORT_RESIDENT_CARD",
  174: "PERSONAL_IDENTIFICATION_VERIFICATION",
  175: "TEMPORARY_OPERATOR_LICENSE",
  176: "DRIVING_LICENSE_UNDER_19",
  177: "IDENTITY_CARD_UNDER_19",
  178: "VISA",
  179: "TEMPORARY_PASSPORT",
  180: "VOTING_CARD",
  181: "HEALTH_CARD",
  182: "CERTIFICATE_OF_CITIZENSHIP",
  183: "ADDRESS_CARD",
  184: "AIRPORT_IMMIGRATION_CARD",
  185: "ALIEN_REGISTRATION_CARD",
  186: "APEH_CARD",
  187: "COUPON_TO_DRIVING_LICENSE",
  188: "CREW_MEMBER_CERTIFICATE",
  189: "DOCUMENT_FOR_RETURN",
  190: "E_CARD",
  191: "EMPLOYMENT_CARD",
  192: "HKSAR_IMMIGRATION_FORM",
  193: "IMMIGRANT_CARD",
  194: "LABOUR_CARD",
  195: "LAISSEZ_PASSER",
  196: "LAWYER_IDENTITY_CERTIFICATE",
  197: "LICENSE_CARD",
  198: "PASSPORT_STATELESS",
  199: "PASSPORT_CHILD",
  200: "PASSPORT_CONSULAR",
  201: "PASSPORT_DIPLOMATIC_SERVICE",
  202: "PASSPORT_OFFICIAL",
  203: "PASSPORT_PROVISIONAL",
  204: "PASSPORT_SPECIAL",
  205: "PERMISSION_TO_THE_LOCAL_BORDER_TRAFFIC",
  206: "REGISTRATION_CERTIFICATE",
  207: "SEDESOL_CARD",
  208: "SOCIAL_CARD",
  209: "TB_CARD",
  210: "VEHICLE_PASSPORT",
  211: "W_DOCUMENT",
  212: "DIPLOMATIC_IDENTITY_CARD",
  213: "CONSULAR_IDENTITY_CARD",
  214: "INCOME_TAX_CARD",
  215: "RESIDENCE_PERMIT",
  216: "DOCUMENT_OF_IDENTITY",
  217: "BORDER_CROSSING_PERMIT",
  218: "PASSPORT_LIMITED_VALIDITY",
  219: "SIM_CARD",
  220: "TAX_CARD",
  221: "COMPANY_CARD",
  222: "DOMESTIC_PASSPORT",
  223: "IDENTITY_CERTIFICATE",
  224: "RESIDENT_ID_CARD",
  225: "ARMED_FORCES_IDENTITY_CARD",
  226: "PROFESSIONAL_CARD",
  227: "REGISTRATION_STAMP",
  228: "DRIVER_CARD",
  229: "DRIVER_TRAINING_CERTIFICATE",
  230: "QUALIFICATION_DRIVING_LICENSE",
  231: "MEMBERSHIP_CARD",
  232: "PUBLIC_VEHICLE_DRIVER_AUTHORITY_CARD",
  233: "MARINE_LICENSE",
  234: "TEMPORARY_LEARNER_LICENSE",
  235: "TEMPORARY_COMMERCIAL_DRIVING_LICENSE",
  236: "INTERIM_INSTRUCTIONAL_PERMIT",
  237: "CERTIFICATE_OF_COMPETENCY",
  238: "CERTIFICATE_OF_PROFICIENCY",
  239: "TRADE_LICENSE",
  240: "PASSPORT_PAGE",
  241: "INVOICE",
  242: "PASSENGER_LOCATOR_FORM",
};

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => !!v && typeof v === 'object' && !Array.isArray(v);

/** Every classification the reader returned, wherever it sits in its result (front page first). */
function candidates(read: unknown): { dType: number; name: string; country: string; page: number }[] {
  const out: { dType: number; name: string; country: string; page: number }[] = [];
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 8 || v === null || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const d = v as Dict;
    if (isDict(d.OneCandidate)) {
      const oc = d.OneCandidate;
      const f = isDict(oc.FDSIDList) ? oc.FDSIDList : {};
      out.push({
        dType: Number(f.dType ?? 0) || 0,
        name: typeof oc.DocumentName === 'string' ? oc.DocumentName : '',
        country: typeof f.ICAOCode === 'string' ? f.ICAOCode : '',
        page: Number(d.page_idx ?? 0) || 0,
      });
    }
    for (const k of Object.keys(d)) if (k !== 'OneCandidate') walk(d[k], depth + 1);
  };
  walk(read, 0);
  return out.sort((a, b) => a.page - b.page);
}

/**
 * The reader's own identity-card types that are a government national identity card (its DocumentType enum). Other
 * "...IDENTITY_CARD" types the reader knows (liquor, social, privileged, tribal, diplomatic, consular, armed forces,
 * temporary-visitor, registered-offender cards) are NOT a national ID, so a national-ID-only workflow refuses them.
 */
const NATIONAL_ID_TYPES = new Set<number>([
  12, // IDENTITY_CARD
  20, // NATIONAL_IDENTITY_CARD
  28, // ALTERNATIVE_IDENTITY_CARD
  75, 76, 77, // ENHANCED_IDENTITY_CARD (and its under-18 / under-21 versions)
  92, // IDENTITY_CARD_MOBILITY_IMPAIRED
  97, 98, 177, // IDENTITY_CARD_UNDER_18 / _UNDER_21 / _UNDER_19
  106, // INTERIM_IDENTITY_CARD
  121, // LIMITED_TERM_IDENTITY_CARD
  159, // TEMPORARY_IDENTITY_CARD
  216, // DOCUMENT_OF_IDENTITY
]);
/** Types the reader uses when it could not tell what kind of document it is: then its document name decides. */
const UNSPECIFIED = new Set<number>([0, 99]);

/**
 * One of the four document kinds a workflow can accept, from the reader's classification of the image (its type code
 * first; its document name only when the type code says nothing), or null when it is none of them.
 */
export function categoryOf(dType: number, documentName: string): DocumentType | null {
  const n = ENGINE_DOCUMENT_TYPES[dType] || '';
  const c = documentName.toLowerCase();
  if (dType && !UNSPECIFIED.has(dType) && n) {
    if (n.includes('PASSPORT')) return 'passport';
    if (n.includes('RESIDEN') || n.includes('ALIEN')) return 'residence-permit';
    if (n.includes('DRIVING') || n.includes('DRIVER')) return 'licence';
    if (NATIONAL_ID_TYPES.has(dType)) return 'national-id';
    return null;
  }
  // the reader named the document but gave no type: its own document name (from its document database) decides
  if (c.includes('passport')) return 'passport';
  if (c.includes('residen')) return 'residence-permit';
  if (c.includes('driving') || (c.includes('driver') && c.includes('licen'))) return 'licence';
  if (c.includes('identity card') || c.includes('national id') || c.includes('id card')) return 'national-id';
  return null;
}

/**
 * What the reader saw: its document kind (null when it is none the workflows know), its document name, country code,
 * and its own type code and type name (kept on the record so an operator can see exactly what it classified).
 */
export function detectedDocument(
  read: unknown,
): { type: DocumentType | null; name: string; country: string; code: number; engineType: string } | null {
  const all = candidates(read);
  if (!all.length) return null;
  const best = all.find((c) => categoryOf(c.dType, c.name)) ?? all[0]!;
  return {
    type: categoryOf(best.dType, best.name),
    name: best.name,
    country: best.country,
    code: best.dType,
    engineType: ENGINE_DOCUMENT_TYPES[best.dType] ?? 'UNKNOWN',
  };
}

export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  passport: 'passport',
  'national-id': 'national ID card',
  licence: "driver's licence",
  'residence-permit': 'residence permit',
};
