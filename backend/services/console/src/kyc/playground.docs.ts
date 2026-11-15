/**
 * The how-to guide for each API, shown in its “How to use” panel: what it does, how to run it, the key
 * response fields, the HTTP statuses, the failure codes and what is allowed. One entry per endpoint id.
 * Generated from scratchpad; regenerate rather than editing by hand.
 */

export type DocField = { field: string; note: string };
export type DocStatus = { code: string; label: string; when: string };
export type DocFailure = { code: string; message: string; fix: string };
export type EndpointDocs = {
  what: string;
  steps: string[];
  returns: DocField[];
  statuses: DocStatus[];
  failures: DocFailure[];
  limits: string[];
  envelope: string;
  notes: string[];
};

export const DOCS: Record<string, EndpointDocs> = {
  "face.analyze": {
    "what": "The all-in-one detection call. For every face it returns the box, the tilt, 5 landmarks, an aligned crop, the attributes you pick and the quality checks you define.",
    "steps": [
      "Upload the face image.",
      "Set the options you want (defaults give a working request).",
      "Press Send. The image is encrypted in your browser first."
    ],
    "returns": [
      {
        "field": "faces[].roi",
        "note": "the face box, [x, y, width, height] in pixels"
      },
      {
        "field": "faces[].landmarks",
        "note": "5 points: eyes, nose, mouth corners"
      },
      {
        "field": "faces[].crop",
        "note": "the aligned crop (when you asked for one)"
      },
      {
        "field": "faces[].attributes[]",
        "note": "each picked attribute: name, value, confidence"
      },
      {
        "field": "faces[].quality",
        "note": "your checks, each with its value, range and status (1 = pass)"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Up to 13 attributes. Each quality check needs a [min, max] range.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "When no face is found, `code` is 2 and `msg` says 'No face was found.' (the HTTP status is still 200). Fields that need a face come back null."
    ]
  },
  "face.detect": {
    "what": "Just the faces: each box, its tilt, 5 landmarks, and the count. No attributes, no quality.",
    "steps": [
      "Upload the face image.",
      "Set the options you want (defaults give a working request).",
      "Press Send. The image is encrypted in your browser first."
    ],
    "returns": [
      {
        "field": "faceCount",
        "note": "how many faces were found"
      },
      {
        "field": "faces[].roi",
        "note": "the face box [x, y, w, h]"
      },
      {
        "field": "faces[].rotationAngle",
        "note": "the in-plane tilt, in degrees"
      },
      {
        "field": "faces[].landmarks",
        "note": "5 points"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Turn off “Only the central face” to get every face.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "When no face is found, `code` is 2 and `msg` says 'No face was found.' (the HTTP status is still 200). Fields that need a face come back null."
    ]
  },
  "face.count": {
    "what": "Confirms an image holds exactly the number of faces you expect, for a capture gate.",
    "steps": [
      "Upload the face image.",
      "Set the options you want (defaults give a working request).",
      "Press Send. The image is encrypted in your browser first."
    ],
    "returns": [
      {
        "field": "faceCount",
        "note": "faces found"
      },
      {
        "field": "ok",
        "note": "true when the count equals your expected value"
      },
      {
        "field": "rule",
        "note": "the rule applied, e.g. expected==1"
      },
      {
        "field": "faces[].roi",
        "note": "each face box"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Expected count is 0 to 100.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "face.attributes": {
    "what": "The attributes you choose, per face. Age is a range; eyes and mouth are open/closed; emotion is a label; the rest are yes/no, each with a confidence.",
    "steps": [
      "Upload the face image.",
      "Set the options you want (defaults give a working request).",
      "Press Send. The image is encrypted in your browser first."
    ],
    "returns": [
      {
        "field": "faces[].roi",
        "note": "the face box"
      },
      {
        "field": "faces[].attributes[]",
        "note": "each picked attribute: name, value, confidence"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Pick any of the 13 attributes; at least one is required.",
      "Age returns a [min, max] band, not a single number.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "When no face is found, `code` is 2 and `msg` says 'No face was found.' (the HTTP status is still 200). Fields that need a face come back null."
    ]
  },
  "face.ppe": {
    "what": "Mask, glasses, head and forehead covering, headphones and occlusion, flattened so each item is one yes/no value per face.",
    "steps": [
      "Upload the face image.",
      "Set the options you want (defaults give a working request).",
      "Press Send. The image is encrypted in your browser first."
    ],
    "returns": [
      {
        "field": "faces[].roi",
        "note": "the face box"
      },
      {
        "field": "faces[].<item>",
        "note": "yes or no for each item you asked for (e.g. MedicalMask)"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Pick any of the six items; at least one is required.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "When no face is found, `code` is 2 and `msg` says 'No face was found.' (the HTTP status is still 200). Fields that need a face come back null."
    ]
  },
  "face.emotion": {
    "what": "The dominant expression of each face. Send one image for per-face results, or a list of frames for a per-frame breakdown plus the overall dominant emotion.",
    "steps": [
      "Upload one image, or add frames of the same person in order.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "faces[].emotion / faces[].confidence",
        "note": "per face, for a single image"
      },
      {
        "field": "perFrame[]",
        "note": "per frame: emotion and confidence (for a batch)"
      },
      {
        "field": "dominant",
        "note": "the most frequent emotion across the frames"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "A batch is 1 to 10 frames.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "When no face is found, `code` is 2 and `msg` says 'No face was found.' (the HTTP status is still 200). Fields that need a face come back null."
    ]
  },
  "face.crop": {
    "what": "An aligned, straightened crop of the face at the shape you choose (square for an avatar, 4:5 for a document).",
    "steps": [
      "Upload the image.",
      "Set the options you want (defaults give a working request).",
      "Press Send. The image is encrypted in your browser first."
    ],
    "returns": [
      {
        "field": "crops[].crop",
        "note": "the aligned crop, base64"
      },
      {
        "field": "crops[].roi",
        "note": "where the face was"
      },
      {
        "field": "crops[].rotationAngle",
        "note": "the tilt that was corrected"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Shapes: 3:4, 4:5, 2:3, 1:1, or 3:4 wider.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "When no face is found, `code` is 2 and `msg` says 'No face was found.' (the HTTP status is still 200). Fields that need a face come back null."
    ]
  },
  "face.redact": {
    "what": "The image back with every face hidden — blurred, pixelated or boxed out — plus where each face was.",
    "steps": [
      "Upload the image.",
      "Set the options you want (defaults give a working request).",
      "Press Send. The image is encrypted in your browser first."
    ],
    "returns": [
      {
        "field": "image",
        "note": "the redacted image, base64"
      },
      {
        "field": "faceCount",
        "note": "faces hidden"
      },
      {
        "field": "boxes[]",
        "note": "each hidden region [x, y, w, h]"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Modes: blur, pixelate, black box.",
      "If no face is found the original image comes back unchanged with faceCount 0.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "face.match": {
    "what": "Compares the faces across two images: every face found in each, with a similarity for each pair. The 1:1 building block.",
    "steps": [
      "Upload exactly two images.",
      "Set each image's source (live, printed, chip) if it is not a live photo.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "results[].similarity",
        "note": "0 to 1, calibrated; about 1 is the same person"
      },
      {
        "field": "results[].score",
        "note": "the raw distance; about 0 is the same person"
      },
      {
        "field": "detections[].faces[]",
        "note": "the faces found in each image, with boxes and crops"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "238",
        "message": "Too many images in one comparison: send exactly two.",
        "fix": "Send exactly two images."
      },
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Exactly two images per call. For more, call once per pair (or use Search / Cluster).",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "When no face is found, `code` is 2 and `msg` says 'No face was found.' (the HTTP status is still 200). Fields that need a face come back null."
    ]
  },
  "face.verify": {
    "what": "A 1:1 decision: the similarity of two faces, and whether it clears your threshold.",
    "steps": [
      "Upload the two faces.",
      "Set a threshold (0.75 is typical).",
      "Press Send."
    ],
    "returns": [
      {
        "field": "similarity",
        "note": "0 to 1, the number to decide on"
      },
      {
        "field": "score",
        "note": "the raw distance"
      },
      {
        "field": "match",
        "note": "true at or above your threshold"
      },
      {
        "field": "threshold",
        "note": "the threshold applied"
      },
      {
        "field": "compared[]",
        "note": "the face box used in each image, so you can see which person was compared"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Threshold is 0 to 1.",
      "livenessTransactionId links the first face to a passed liveness session.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "If either image has no face, match is false and similarity is null, with the reason in warnings."
    ]
  },
  "face.similarity": {
    "what": "Only the raw numbers: similarity and distance between two faces. No threshold, no decision.",
    "steps": [
      "Upload the two faces.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "similarity",
        "note": "0 to 1, calibrated"
      },
      {
        "field": "score",
        "note": "the raw distance"
      },
      {
        "field": "compared[]",
        "note": "the face box used in each image"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "face.search": {
    "what": "One face against a gallery you send. Returns the gallery faces at or above your threshold, highest similarity first.",
    "steps": [
      "Upload the face to find.",
      "Add gallery faces, each with your own id.",
      "Set topK and a threshold.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "matches[]",
        "note": "id, similarity and rank, best first, above the threshold"
      },
      {
        "field": "best",
        "note": "the top match, or null"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "1 to 10 gallery faces. Each is compared one at a time, so more faces take longer.",
      "A gallery face with no detectable face is skipped and noted in warnings.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "face.dedupe": {
    "what": "Whether a new face already exists in your set: the closest existing face and if it clears the duplicate threshold.",
    "steps": [
      "Upload the new face.",
      "Add the existing faces with ids.",
      "Set a threshold (0.8 is typical).",
      "Press Send."
    ],
    "returns": [
      {
        "field": "duplicate",
        "note": "true if the closest face is at or above your threshold"
      },
      {
        "field": "matchedId",
        "note": "the id it matched, or null"
      },
      {
        "field": "similarity",
        "note": "the closest similarity"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "1 to 10 existing faces.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "face.watchlist": {
    "what": "A face against your own labelled list (blocked, VIP, staff). Returns a hit and the matched entry with its label.",
    "steps": [
      "Upload the face to check.",
      "Add list faces, each with an id and a label.",
      "Set a threshold.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "hit",
        "note": "true if a list face clears the threshold"
      },
      {
        "field": "entry",
        "note": "the matched id, label and similarity, or null"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "1 to 10 list faces.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "face.cluster": {
    "what": "Groups faces by person. Every pair is compared, and faces are linked when they clear your threshold.",
    "steps": [
      "Add 2 to 8 faces, each with an id.",
      "Set a threshold.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "clusters[]",
        "note": "groups of ids that are the same person"
      },
      {
        "field": "pairs[]",
        "note": "every pair with its similarity, highest first"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "2 to 8 faces (every pair is compared, so this grows quickly).",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "face.age": {
    "what": "The age range of each face, its midpoint, and an aligned crop. The range is most exact with the crop on.",
    "steps": [
      "Upload the face image.",
      "Set the options you want (defaults give a working request).",
      "Press Send. The image is encrypted in your browser first."
    ],
    "returns": [
      {
        "field": "faces[].age",
        "note": "the [min, max] age band"
      },
      {
        "field": "faces[].ageMid",
        "note": "the midpoint, for a single number"
      },
      {
        "field": "faces[].crop",
        "note": "the aligned crop"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Keep the crop on for the exact range.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "When no face is found, `code` is 2 and `msg` says 'No face was found.' (the HTTP status is still 200). Fields that need a face come back null."
    ]
  },
  "age.verify": {
    "what": "An age gate: pass or fail against a minimum age, deciding on the lower end of the range (strict) or the midpoint.",
    "steps": [
      "Upload the face image.",
      "Set the options you want (defaults give a working request).",
      "Press Send. The image is encrypted in your browser first."
    ],
    "returns": [
      {
        "field": "age",
        "note": "the estimated band"
      },
      {
        "field": "allowed",
        "note": "true if old enough"
      },
      {
        "field": "basis",
        "note": "the exact rule applied, e.g. lowerBound(29)>=18"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Minimum age 0 to 120.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "age.verify-live": {
    "what": "The age gate plus liveness: allowed only when the person is old enough AND the face is live.",
    "steps": [
      "Upload the face image.",
      "Set the options you want (defaults give a working request).",
      "Press Send. The image is encrypted in your browser first."
    ],
    "returns": [
      {
        "field": "age",
        "note": "the estimated band"
      },
      {
        "field": "allowed",
        "note": "true only if old enough and live"
      },
      {
        "field": "live",
        "note": "the liveness result"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "A single still often reads as not-live; this is strongest with a genuine live capture.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "face.quality": {
    "what": "Scores a portrait against a standard (ICAO, Schengen, US visa, Full) or your own checks. Returns every check with its value, its range and pass/fail, plus group roll-ups and an optional crop.",
    "steps": [
      "Upload the portrait.",
      "Pick a standard, or add your own checks to replace it.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "compliant",
        "note": "true when nothing failed"
      },
      {
        "field": "nonCompliant[]",
        "note": "the checks that failed"
      },
      {
        "field": "checks[]",
        "note": "every check: name, range, value, status"
      },
      {
        "field": "groups[]",
        "note": "per group, how many passed"
      },
      {
        "field": "crop",
        "note": "the aligned crop, if requested"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "ICAO and US visa run 44 checks, Schengen 43, Full 47.",
      "Your own checks replace the standard: exactly those run, with your ranges.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "A check's status is 1 for pass, 0 for fail. nonCompliant lists the names that failed.",
      "When no face is found, `code` is 2 and `msg` says 'No face was found.' (the HTTP status is still 200). Fields that need a face come back null."
    ]
  },
  "photo.compliance": {
    "what": "A pass/fail against one named passport or visa photo standard, with the list of failed checks.",
    "steps": [
      "Upload the portrait.",
      "Pick the standard.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "compliant",
        "note": "true or false"
      },
      {
        "field": "nonCompliant[]",
        "note": "the checks that failed"
      },
      {
        "field": "checks[]",
        "note": "every check with value and status"
      },
      {
        "field": "standard",
        "note": "the standard applied"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Standards: ICAO, VisaSchengen, VisaUSA, Full.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "A check's status is 1 for pass, 0 for fail. nonCompliant lists the names that failed."
    ]
  },
  "photo.policy": {
    "what": "Your own checks with your own ranges. Exactly the checks you send run — nothing else.",
    "steps": [
      "Upload the portrait.",
      "Add checks, each with a [min, max] range.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "pass",
        "note": "true when every check passed"
      },
      {
        "field": "failed[]",
        "note": "the checks that failed"
      },
      {
        "field": "checks[]",
        "note": "each check: name, range, value, status"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "At least one check. Pick from the full check list; each needs a range.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "A check's status is 1 for pass, 0 for fail. nonCompliant lists the names that failed."
    ]
  },
  "photo.gate": {
    "what": "A fast good-enough answer. Only the checks you require run, at their standard ranges, so it returns one ok and the list of any that failed.",
    "steps": [
      "Upload the photo.",
      "Pick the checks to require.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "ok",
        "note": "true when every required check passed"
      },
      {
        "field": "failed[]",
        "note": "the checks that failed"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "At least one check. Ranges are the standard ones, not yours (use Photo Policy for custom ranges).",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "photo.autofix": {
    "what": "The portrait cropped to the shape you need, with the background replaced by your colour.",
    "steps": [
      "Upload the portrait.",
      "Choose the shape and background colour.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "image",
        "note": "the fixed portrait, base64"
      },
      {
        "field": "aspect",
        "note": "the shape applied"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Shapes: 3:4, 4:5, 2:3, 1:1. Colour is [red, green, blue], each 0 to 255.",
      "If the background cannot be told apart from the face (a portrait printed on a pattern), image is null and the reason is in warnings.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "photo.best-frame": {
    "what": "Picks the most compliant of several frames against a standard, and shows how every frame ranked.",
    "steps": [
      "Add 2 to 10 frames.",
      "Pick the standard.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "bestIndex",
        "note": "the index of the best frame, or null if none had a face"
      },
      {
        "field": "ranking[]",
        "note": "each frame: compliant and failedCount, best first"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "2 to 10 frames.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "liveness": {
    "what": "Passive liveness from one image. status 0 means live, 1 means not live or undetermined; code carries the reason; an age estimate comes free.",
    "steps": [
      "Upload the selfie.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "status",
        "note": "0 = live, 1 = not live"
      },
      {
        "field": "live",
        "note": "the same as status 0, as a boolean"
      },
      {
        "field": "code",
        "note": "the reason code (0 when live)"
      },
      {
        "field": "age",
        "note": "an age estimate"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Single image (passive). The face should be at least about 480×480 px.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "Reason codes: 244 printed/3D mask, 245 screen or device, 247 wrong environment, 230 closed eyes, 231 low quality, 234 sunglasses, 239 mask, 240 occlusion, 249 wrong view, 260 capture unusable, 2 no face. A still photo normally reads as not-live."
    ]
  },
  "liveness.antispoof": {
    "what": "The same check with the reason spelled out: whether it is live, the reason by name, and its category (a presentation attack or a capture problem).",
    "steps": [
      "Upload the selfie.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "live",
        "note": "true or false"
      },
      {
        "field": "reason",
        "note": "the reason by name, e.g. ART_MASK"
      },
      {
        "field": "reasonCode",
        "note": "the numeric code"
      },
      {
        "field": "category",
        "note": "presentation-attack, capture-quality, no-face or none"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "Reason codes: 244 printed/3D mask, 245 screen or device, 247 wrong environment, 230 closed eyes, 231 low quality, 234 sunglasses, 239 mask, 240 occlusion, 249 wrong view, 260 capture unusable, 2 no face. A still photo normally reads as not-live."
    ]
  },
  "liveness.gate": {
    "what": "One pass/fail for a pipeline. Strict also requires a clean reason code, not just a live verdict.",
    "steps": [
      "Upload the selfie.",
      "Leave Strict on for the tightest gate.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "pass",
        "note": "true when live (and, in strict mode, the reason code is clean)"
      },
      {
        "field": "status",
        "note": "0 = live, 1 = not"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": [
      "Reason codes: 244 printed/3D mask, 245 screen or device, 247 wrong environment, 230 closed eyes, 231 low quality, 234 sunglasses, 239 mask, 240 occlusion, 249 wrong view, 260 capture unusable, 2 no face. A still photo normally reads as not-live."
    ]
  },
  "identity.verify": {
    "what": "One call that runs liveness, a quality gate and a 1:1 match against your reference face, and returns each step plus a single verified verdict.",
    "steps": [
      "Upload the selfie and the reference face (e.g. the ID portrait).",
      "Pick the quality checks and a match threshold.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "verified",
        "note": "true only if live, quality passed and the faces matched"
      },
      {
        "field": "live / qualityOk / similarity",
        "note": "each step's own result"
      },
      {
        "field": "steps",
        "note": "the full detail of liveness, quality and match"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Match threshold 0 to 1. Pass the ID portrait from Document Portrait as the reference.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "auth.login": {
    "what": "Passwordless login: a live selfie searched against your enrolled users. Authenticated only when the face is live and matches someone above the threshold.",
    "steps": [
      "Upload the selfie.",
      "Add your enrolled users with ids.",
      "Set a threshold.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "authenticated",
        "note": "true if live and matched"
      },
      {
        "field": "userId",
        "note": "who it matched, or null"
      },
      {
        "field": "similarity",
        "note": "the best similarity"
      },
      {
        "field": "live",
        "note": "the liveness result"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "1 to 10 enrolled users.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "fraud.signup-check": {
    "what": "At sign-up: is the face live, and has it signed up before? Blocks a duplicate (similarity 0.8+) or a non-live face.",
    "steps": [
      "Upload the selfie.",
      "Add the existing users with ids.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "allow",
        "note": "true only if live and not a duplicate"
      },
      {
        "field": "reason",
        "note": "duplicate, not_live, or null"
      },
      {
        "field": "matchedId",
        "note": "the duplicate's id, if any"
      },
      {
        "field": "live",
        "note": "the liveness result"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "1 to 10 existing users.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "proctor.check": {
    "what": "One webcam frame judged for exam proctoring: live, exactly one face, looking at the screen, and no mask.",
    "steps": [
      "Upload the webcam frame.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "ok",
        "note": "true when all four conditions hold"
      },
      {
        "field": "live / faceCount / lookingAway / maskWorn",
        "note": "each condition"
      },
      {
        "field": "offGaze",
        "note": "the gaze-off-camera value"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "age-gate.checkout": {
    "what": "Age and liveness together for an age-restricted sale: allowed only when old enough and live.",
    "steps": [
      "Upload the selfie.",
      "Set the minimum age.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "allowed",
        "note": "true only if old enough and live"
      },
      {
        "field": "age",
        "note": "the estimated band"
      },
      {
        "field": "live",
        "note": "the liveness result"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Minimum age 0 to 120.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "kiosk.photo": {
    "what": "A passport/visa photo booth in one call: compliance against a standard, an auto-fixed version, and whether the fixed photo is ready to print.",
    "steps": [
      "Upload the portrait.",
      "Pick the standard, shape and background colour.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "compliant",
        "note": "whether the original passed"
      },
      {
        "field": "nonCompliant[]",
        "note": "what failed"
      },
      {
        "field": "fixedImage",
        "note": "the cropped, re-backgrounded photo"
      },
      {
        "field": "printReady",
        "note": "true if the fixed photo passes the standard"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No face image.",
        "fix": "Add the image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The engine could not process this request.",
        "fix": "Usually momentary. Try again; if it persists the image may be unreadable."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Standards: ICAO, VisaSchengen, VisaUSA, Full.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "idv.read": {
    "what": "The full read of an ID document. Returns every container the reader produced — type, printed and MRZ fields, portrait, security and image-quality checks — under data.ContainerList. An optional hint says whether the document matches what you expected.",
    "steps": [
      "Upload the front (and the back when it carries data).",
      "Optionally set the expected country and type.",
      "Press Send (a full read can take a minute)."
    ],
    "returns": [
      {
        "field": "data.ContainerList.List[]",
        "note": "the containers; read each by its own result_type, order is not fixed"
      },
      {
        "field": "doc_hint",
        "note": "the match against your expected country and type (when you set a hint)"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No document image.",
        "fix": "Add the document image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The document could not be read.",
        "fix": "Use a sharper, well-lit, uncropped photo of the whole document."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Front required; back optional. ~1,400 document types.",
      "Personal values are not masked here; gate who may call it. Use Document Fields for a masked view.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "idv.classify": {
    "what": "Just the identity of the document: its name, category, issuing country, year and a confidence.",
    "steps": [
      "Upload the document front.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "document_name",
        "note": "the full type name"
      },
      {
        "field": "category",
        "note": "Passport, National ID, Driving Licence or Residence Permit"
      },
      {
        "field": "country / country_name",
        "note": "the issuer, ISO alpha-3 and name"
      },
      {
        "field": "state",
        "note": "the state or province that issued it (licences and IDs), or null"
      },
      {
        "field": "size",
        "note": "ID-1 card, ID-2, ID-3 passport page or A4"
      },
      {
        "field": "has_mrz / has_chip",
        "note": "whether this type carries an MRZ, and a chip"
      },
      {
        "field": "deprecated",
        "note": "true when the issuer no longer issues this type"
      },
      {
        "field": "confidence",
        "note": "0 to 1"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No document image.",
        "fix": "Add the document image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The document could not be read.",
        "fix": "Use a sharper, well-lit, uncropped photo of the whole document."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "idv.mrz": {
    "what": "The MRZ read from the document: the raw lines, the parsed fields, and every check digit recomputed under ICAO 9303 (the same rule for every country).",
    "steps": [
      "Upload the page that carries the MRZ.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "lines[]",
        "note": "the raw MRZ lines"
      },
      {
        "field": "format",
        "note": "TD1, TD2, TD3 or a visa"
      },
      {
        "field": "valid",
        "note": "true when every check digit holds and dates are real"
      },
      {
        "field": "expired",
        "note": "true when the expiry date has passed"
      },
      {
        "field": "check_digits",
        "note": "each check digit with its recomputed digit and ok/fail"
      },
      {
        "field": "print_quality",
        "note": "the MRZ print checks: check sums, contrast, format, position, stains, symbols"
      },
      {
        "field": "parsed",
        "note": "the named fields"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No document image.",
        "fix": "Add the document image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The document could not be read.",
        "fix": "Use a sharper, well-lit, uncropped photo of the whole document."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Returns an empty result with a warning when the document has no MRZ.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "idv.portrait": {
    "what": "The portrait cut from the document, and a one-time reference you can pass straight to Face Verify or Face Match as image1.",
    "steps": [
      "Upload the document.",
      "Press Send.",
      "Use portrait_ref as a reference in a Face call within the hour."
    ],
    "returns": [
      {
        "field": "portrait_ref",
        "note": "a doc_ token for the portrait, reusable in a Face call"
      },
      {
        "field": "face_detected",
        "note": "whether a face was found on the document"
      },
      {
        "field": "faces_on_document",
        "note": "how many faces the page carries (a second is often the ghost image)"
      },
      {
        "field": "face_confidence",
        "note": "0 to 1, how sure the face detection is"
      },
      {
        "field": "portrait",
        "note": "the portrait image, base64"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No document image.",
        "fix": "Add the document image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The document could not be read.",
        "fix": "Use a sharper, well-lit, uncropped photo of the whole document."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "The reference token lasts about an hour.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "idv.authenticity": {
    "what": "The document's checks and the capture's image quality. Each item is pass, fail or not_checked, with one overall verdict.",
    "steps": [
      "Upload the front (and the back when present).",
      "Press Send."
    ],
    "returns": [
      {
        "field": "overall",
        "note": "the top-line verdict: pass, fail or not_checked"
      },
      {
        "field": "failed[]",
        "note": "every check that failed, expiry included"
      },
      {
        "field": "summary",
        "note": "how many checks passed, failed or were not checked"
      },
      {
        "field": "checks[]",
        "note": "each document check with its status"
      },
      {
        "field": "image_quality",
        "note": "glare, focus, resolution, screen capture, bounds, portrait"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No document image.",
        "fix": "Add the document image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The document could not be read.",
        "fix": "Use a sharper, well-lit, uncropped photo of the whole document."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Status values: pass, fail, not_checked. A specimen document can read as fail by design.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "idv.fields": {
    "what": "Which fields were read, from which sources, whether each is valid, and whether the sources agree. Values are masked, so it is safe to log.",
    "steps": [
      "Upload the document.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "summary",
        "note": "how many fields are valid, failed or not checked, and how many disagree between sources"
      },
      {
        "field": "fields[].label",
        "note": "the field name"
      },
      {
        "field": "fields[].sources",
        "note": "where it was read: MRZ, VISUAL, BARCODE"
      },
      {
        "field": "fields[].status",
        "note": "valid, fail or not_checked"
      },
      {
        "field": "fields[].sources_agree",
        "note": "whether the sources match"
      },
      {
        "field": "fields[].value_masked",
        "note": "the value, masked"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No document image.",
        "fix": "Add the document image before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Image could not be opened.",
        "fix": "The upload expired or was not an image. Pick the file again."
      },
      {
        "code": "engine_error",
        "message": "The document could not be read.",
        "fix": "Use a sharper, well-lit, uncropped photo of the whole document."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Raw values are never returned here; use Document Read for full values, behind access control.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "poa.analyze": {
    "what": "Reads a proof-of-address document (utility bill, bank statement, letter) and checks it against the name, address and country you expect, with a recency and integrity check.",
    "steps": [
      "Upload the document (PDF or image).",
      "Optionally enter the expected name, address and country.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "document",
        "note": "what it is, type, issue date"
      },
      {
        "field": "address",
        "note": "the extracted address, split into parts"
      },
      {
        "field": "verification.comparisons",
        "note": "name, address and country against what you expected"
      },
      {
        "field": "verification.recency",
        "note": "how old the document is vs the limit"
      },
      {
        "field": "verification.decision",
        "note": "pass, refer or fail, with reasons"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_document",
        "message": "No document.",
        "fix": "Add the document before sending."
      },
      {
        "code": "document_unavailable",
        "message": "Document could not be opened.",
        "fix": "The upload expired. Pick the file again."
      }
    ],
    "limits": [
      "PDF, JPG, PNG or WebP, up to 10 MB.",
      "The document is encrypted in your browser; the API takes its one-time token.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "mrz.read": {
    "what": "Finds the MRZ in an image, reads it, parses every field, and validates every check digit under ICAO 9303.",
    "steps": [
      "Upload the document image.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "lines[]",
        "note": "the MRZ lines"
      },
      {
        "field": "warped_box",
        "note": "where the MRZ was"
      },
      {
        "field": "confidence[]",
        "note": "per-line read confidence"
      },
      {
        "field": "format",
        "note": "TD1, TD2, TD3 or a visa"
      },
      {
        "field": "valid",
        "note": "true when every check digit holds and dates are real"
      },
      {
        "field": "expired",
        "note": "true when the expiry date has passed"
      },
      {
        "field": "problems[]",
        "note": "any check that failed, and why"
      },
      {
        "field": "parsed",
        "note": "the fields, with check_digits"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No document image.",
        "fix": "Add the image."
      },
      {
        "code": "engine_error",
        "message": "The MRZ could not be read.",
        "fix": "Use a sharper photo that includes the full MRZ."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Works at any orientation, up to 4K. Returns empty with a warning when no MRZ is found.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "mrz.recognize": {
    "what": "Only the MRZ lines, where they are, and how confident the read is. No parsing.",
    "steps": [
      "Upload the document image.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "lines[]",
        "note": "the MRZ lines"
      },
      {
        "field": "warped_box",
        "note": "where the MRZ was"
      },
      {
        "field": "confidence[]",
        "note": "per-line read confidence"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "no_image",
        "message": "No document image.",
        "fix": "Add the image."
      },
      {
        "code": "engine_error",
        "message": "The MRZ could not be read.",
        "fix": "Use a sharper photo."
      }
    ],
    "limits": [
      "Images are JPEG, PNG or WebP, up to about 11 MB each. They are encrypted in your browser and the API only ever sees a one-time token, never the picture.",
      "Returns empty lines with a warning when no MRZ is found.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "mrz.parse": {
    "what": "Parses MRZ lines you already have (no image): every field, every check digit recomputed, and a check that the dates are real.",
    "steps": [
      "Enter the MRZ lines (an ID card is 3×30, a passport 2×44).",
      "Press Send."
    ],
    "returns": [
      {
        "field": "format",
        "note": "TD1, TD2, TD3 or a visa"
      },
      {
        "field": "valid",
        "note": "true when every check digit holds and dates are real"
      },
      {
        "field": "expired",
        "note": "true when the expiry date has passed"
      },
      {
        "field": "problems[]",
        "note": "any check that failed"
      },
      {
        "field": "parsed",
        "note": "the fields, with check_digits"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "invalid_input",
        "message": "(names the problem)",
        "fix": "Lines must be the right length and use only A-Z, 0-9 and <."
      }
    ],
    "limits": [
      "1 to 3 lines; letters A to Z, digits, and < only.",
      "No image and no upload — this is pure parsing.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "email.verify": {
    "what": "Whether an address can receive mail and whether the mailbox exists, flagging temporary inboxes and typos, with a risk level and the reasons behind it.",
    "steps": [
      "Enter the email address.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "mailbox",
        "note": "exists, missing, catch_all or unverified"
      },
      {
        "field": "mail_server",
        "note": "whether the domain can receive mail, and its servers"
      },
      {
        "field": "disposable / free_provider",
        "note": "flags"
      },
      {
        "field": "risk",
        "note": "low, medium or high, with the reasons"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "invalid_input",
        "message": "(names the field)",
        "fix": "Correct the value the message points to and send again."
      },
      {
        "code": "unavailable",
        "message": "Please try again shortly.",
        "fix": "A data source did not answer. Safe to retry."
      }
    ],
    "limits": [
      "A domain that accepts everything cannot confirm one mailbox; a one-time code proves it.",
      "No personal data beyond the address is needed.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "email.footprint": {
    "what": "The sites where an email address has an account, found through each site's sign-up and recovery forms.",
    "steps": [
      "Enter the email address.",
      "Press Send (this can take up to a few minutes)."
    ],
    "returns": [
      {
        "field": "count",
        "note": "how many sites"
      },
      {
        "field": "accounts[]",
        "note": "each site and domain, with any recovery hints"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "invalid_input",
        "message": "(names the field)",
        "fix": "Correct the value the message points to and send again."
      },
      {
        "code": "unavailable",
        "message": "Please try again shortly.",
        "fix": "A data source did not answer. Safe to retry."
      }
    ],
    "limits": [
      "Slow (up to ~150s). A lead for investigation, not proof of ownership.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "osint.username": {
    "what": "Public profiles that use a username, across hundreds of sites. Profiles whose page does not actually contain the name are dropped.",
    "steps": [
      "Enter the username.",
      "Choose how many sites to check.",
      "Press Send (this can take a minute or two)."
    ],
    "returns": [
      {
        "field": "found",
        "note": "profiles kept"
      },
      {
        "field": "common",
        "note": "true when the name is on very many sites, so it says little"
      },
      {
        "field": "profiles[]",
        "note": "each site and URL"
      },
      {
        "field": "left_out",
        "note": "pages dropped because the username is not in their address (a search page is not an account)"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "invalid_input",
        "message": "(names the field)",
        "fix": "Correct the value the message points to and send again."
      },
      {
        "code": "unavailable",
        "message": "Please try again shortly.",
        "fix": "A data source did not answer. Safe to retry."
      }
    ],
    "limits": [
      "Slow. A shared username is a lead, not proof of one person.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "phone.lookup": {
    "what": "Whether a number is valid and live, with its format, country, line type, carrier, SMS pumping risk, SIM swap and forwarding, and a risk level. With a name, the carrier is also asked whether the number belongs to that person.",
    "steps": [
      "Enter the number with its country code.",
      "Optionally add a name, date of birth and country for the identity match.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "valid",
        "note": "whether the number is valid"
      },
      {
        "field": "format",
        "note": "E.164, national and international spellings"
      },
      {
        "field": "country",
        "note": "code, name and calling code"
      },
      {
        "field": "line",
        "note": "type and carrier"
      },
      {
        "field": "sms_pumping / sim_swap / call_forwarding",
        "note": "each package, or why it was not available"
      },
      {
        "field": "risk",
        "note": "low, medium or high, with the reasons"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "invalid_input",
        "message": "(names the field)",
        "fix": "Correct the value the message points to and send again."
      },
      {
        "code": "unavailable",
        "message": "Please try again shortly.",
        "fix": "A data source did not answer. Safe to retry."
      }
    ],
    "limits": [
      "Number with country code, e.g. +250788123456.",
      "Some packages are offered only in certain countries; when not, the field says why.",
      "This does not send an SMS.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "phone.otp.send": {
    "what": "Sends a one-time code by SMS to prove the person holds the number.",
    "steps": [
      "Enter the number with its country code.",
      "Press Send. A real SMS goes to that number."
    ],
    "returns": [
      {
        "field": "status",
        "note": "pending when the code was sent"
      },
      {
        "field": "to / channel",
        "note": "where and how it was sent"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "otp_send_failed",
        "message": "(the carrier's reason)",
        "fix": "Check the number and country, and that the account may send to it."
      }
    ],
    "limits": [
      "Sends a real SMS — use a number you control for testing.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "phone.otp.check": {
    "what": "Checks the code the person entered against the one that was sent.",
    "steps": [
      "Enter the same number.",
      "Enter the code the person received.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "status",
        "note": "approved or failed"
      },
      {
        "field": "valid",
        "note": "true when the code is correct"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "otp_check_failed",
        "message": "(the reason)",
        "fix": "Resend a code and try again if it expired."
      }
    ],
    "limits": [
      "Codes expire; a few wrong tries end the attempt.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "screen.ip": {
    "what": "Where an IP address is, who runs it, whether it hides the user (VPN, proxy, Tor, data centre), its abuse reports, and a risk level with reasons.",
    "steps": [
      "Enter the IPv4 or IPv6 address.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "location",
        "note": "continent, country, region, city, coordinates and time zones"
      },
      {
        "field": "network",
        "note": "ASN, owner, ISP, operator, domain, reverse DNS hostnames, mobile"
      },
      {
        "field": "anonymity",
        "note": "tor, vpn, datacenter, proxy, private relay, blocklisted"
      },
      {
        "field": "reputation",
        "note": "abuse score, reports, reporters, last report, usage, allowlisted; or why unavailable"
      },
      {
        "field": "risk",
        "note": "low, medium or high, with the reasons"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "invalid_input",
        "message": "(names the field)",
        "fix": "Correct the value the message points to and send again."
      },
      {
        "code": "unavailable",
        "message": "Please try again shortly.",
        "fix": "A data source did not answer. Safe to retry."
      }
    ],
    "limits": [
      "Abuse reports come from an outside source and may occasionally be unavailable; the rest still returns.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "ip.analyze": {
    "what": "The fast answer from the platform's own lists only: Tor, VPN, data centre, cloud, private relay, blocklist and the network owner. No outside call, so it is quick.",
    "steps": [
      "Enter the IP address.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "anonymity",
        "note": "tor, vpn, datacenter, cloud, private relay and its region, blocklisted"
      },
      {
        "field": "network",
        "note": "ASN, owner, connection type"
      },
      {
        "field": "location",
        "note": "continent, country, region, city, coordinates and time zones"
      },
      {
        "field": "lists_updated",
        "note": "when the lists were refreshed"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "invalid_input",
        "message": "(names the field)",
        "fix": "Correct the value the message points to and send again."
      },
      {
        "code": "unavailable",
        "message": "Please try again shortly.",
        "fix": "A data source did not answer. Safe to retry."
      }
    ],
    "limits": [
      "Uses local lists only (about 20 ms). For abuse reports too, use IP Risk.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "screen.sanctions": {
    "what": "Screens a person or company against sanctions, politically exposed person and crime lists. Every detail you give — name, date of birth, nationality, ID number — is scored together, and each result explains why it matched.",
    "steps": [
      "Enter the name.",
      "Add a date of birth, country or ID number to narrow it.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "summary",
        "note": "results, matches and top score"
      },
      {
        "field": "results[].score / match",
        "note": "the score and whether it crossed the bar"
      },
      {
        "field": "results[].topics / lists",
        "note": "why it is listed, in the standard risk words (Sanction, PEP, Debarment...), and the lists by their published names"
      },
      {
        "field": "results[].why",
        "note": "per detail you gave (name, birth year or date, country, ID number): whether it raised or lowered the score; for the name, the words that matched exactly, closely or as an equivalent, and the extra words on either side"
      },
      {
        "field": "results[].details",
        "note": "for the first three confirmed matches: aliases, addresses, each sanction (authority, programme, reason, dates), roles, and when the record last changed"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "invalid_input",
        "message": "(names the field)",
        "fix": "Correct the value the message points to and send again."
      },
      {
        "code": "unavailable",
        "message": "Please try again shortly.",
        "fix": "A data source did not answer. Safe to retry."
      }
    ],
    "limits": [
      "Name-only screening is not a decision — confirm with a date of birth or an identifier.",
      "Up to 5 countries and 5 ID numbers.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "osint.web": {
    "what": "Web pages that name a person or company, filtered to adverse news by default and tagged with risk topics.",
    "steps": [
      "Enter the name.",
      "Choose adverse media only or everything.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "results[]",
        "note": "title, site, url, date, topics and a snippet"
      },
      {
        "field": "complete",
        "note": "false when some sources did not answer"
      },
      {
        "field": "left_out",
        "note": "how many were dropped as off-name, not adverse, or a screening-list entry page (those facts come from Screening)"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "invalid_input",
        "message": "(names the field)",
        "fix": "Correct the value the message points to and send again."
      },
      {
        "code": "unavailable",
        "message": "Please try again shortly.",
        "fix": "A data source did not answer. Safe to retry."
      }
    ],
    "limits": [
      "Results depend on outside search engines; complete=false means retry later for more.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "screen.crypto": {
    "what": "A verdict and a risk level for up to 100 wallet addresses, on any supported network, from sanctions and illicit-activity data.",
    "steps": [
      "Enter the wallet addresses, one per line.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "checked / counts",
        "note": "how many, grouped by verdict"
      },
      {
        "field": "results[].verdict",
        "note": "sanctioned, illicit, formerly_sanctioned, scheme_participant, named_in_risk_list, risk_attribution, service, mentioned, disputed_listing or no_record; and for input that is not an address: invalid_address, unreadable or unrecognised"
      },
      {
        "field": "results[].risk",
        "note": "high, medium, low or unknown"
      },
      {
        "field": "results[].summary",
        "note": "the verdict in one sentence"
      },
      {
        "field": "results[].listings / disputed_by / labels",
        "note": "for an address on record: each listing and its category, who vouches for it, and what it is known as"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "invalid_input",
        "message": "(names the field)",
        "fix": "Correct the value the message points to and send again."
      },
      {
        "code": "unavailable",
        "message": "Please try again shortly.",
        "fix": "A data source did not answer. Safe to retry."
      }
    ],
    "limits": [
      "1 to 100 addresses. Invalid addresses are returned with an invalid_address verdict, not an error.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  },
  "verify.contact": {
    "what": "Everything in one call: email, phone, IP, sanctions screening and wallet, each part in exactly the same shape as its own API. The slower checks (accounts, username, adverse media) are opt-in.",
    "steps": [
      "Enter any of email, phone, name, IP or wallet.",
      "Tick any slower checks you want.",
      "Press Send."
    ],
    "returns": [
      {
        "field": "email / phone / ip / screening / wallet",
        "note": "each source's own result, or an error note for that part"
      },
      {
        "field": "(opt-in) accounts / username / web",
        "note": "only when you tick them"
      }
    ],
    "statuses": [
      {
        "code": "200",
        "label": "OK",
        "when": "The call ran. Check `ok` in the body: true means a result is in `data`, false means a handled problem is in `error`."
      },
      {
        "code": "400",
        "label": "Bad request",
        "when": "A required field is missing, or a value is the wrong shape. The message names the field. Nothing was sent to the engine."
      },
      {
        "code": "401 / 403",
        "label": "Not allowed",
        "when": "You are not signed in to the console, or your session may not run the Playground."
      },
      {
        "code": "429",
        "label": "Too many runs",
        "when": "More than 60 runs in an hour from here. Wait a few minutes."
      },
      {
        "code": "502 / 503",
        "label": "Upstream problem",
        "when": "The engine or a data source did not answer in time. Safe to retry."
      }
    ],
    "failures": [
      {
        "code": "invalid_input",
        "message": "(names the field)",
        "fix": "Correct the value the message points to and send again."
      },
      {
        "code": "unavailable",
        "message": "Please try again shortly.",
        "fix": "A data source did not answer. Safe to retry."
      }
    ],
    "limits": [
      "At least one input. A failing part is reported in place; the rest still returns.",
      "The opt-in checks each add up to a few minutes.",
      "Up to 60 runs an hour from this page."
    ],
    "envelope": "Every response is `{ ok, request_id, latency_ms, data, warnings, error }`. Read `data` when `ok` is true; read `error.message` when it is false. `warnings` holds anything that was skipped while the rest of the call still succeeded.",
    "notes": []
  }
};
