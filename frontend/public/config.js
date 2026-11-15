// Runtime backend locator. Edit these to point the static UI at the backends.
// No rebuild needed - this file is read at page load.
//   apiBase      - recognition gateway (also serves 1:1 face match at /face)
//   livenessBase - document-liveness gateway (KBY-AI idl)
//   web3formsKey - access key for the Contact form (https://web3forms.com).
//                  Sign up free with mosesmanek7@gmail.com, paste the key here.
//                  Web3Forms keys are SAFE to expose (they only allow sending to
//                  your pre-configured inbox). Until set, the Contact form errors.
window.__RECOG_CONFIG__ = {
  // Human check on public forms (Cloudflare Turnstile site key; public by design). Empty = off.
  // This is Cloudflare's published TEST key (always passes): local development only.
  turnstileSiteKey: "1x00000000000000000000AA",
  // POINTING AT THE DEPLOYED AZURE BACKEND (bundled: ID boxes + Face + Credit V2).
  // To test against a LOCAL backend instead, set this back to "http://127.0.0.1:8081".
  apiBase: "https://api.verivision.mmose.tech",
  livenessBase: "https://apiv2.verivision.mmose.tech",
  web3formsKey: "77f0ac55-4058-4dc4-9aaf-f3dfd63e4277",
  // (No direct engine URL here any more: ID documents, the face match and proof of
  // address are encrypted in the browser and go through the Console API session.)
  // In-browser capture models (self-hosted, no license). Served from our own
  // origin by default; point these at Contabo URLs to host them there.
  //   docalignerModelUrl - finds the document and its corners
  //   ppocrModelUrl      - confirms real text is present (readability)
  docalignerModelUrl: "/models/docaligner.onnx",
  ppocrModelUrl: "/models/ppocr_det.onnx",
  // Clarity dial for auto-capture (0..1). Higher = stricter about sharpness.
  // 0.85 pickier, 0.66 more lenient (webcams are soft). No rebuild needed.
  captureFocusMin: 0.72,
  // Digital zoom so a hand-held document fills the guide (1 = none, 2 = tight).
  captureZoom: 1.7,
  // Blur bar for the FINAL image check before the SDK (capture + upload). Lower =
  // more lenient. 0.73 rejects soft/blurry images. No rebuild needed.
  validateFocusMin: 0.73,
  // Regula Face liveness. faceServiceUrl = the Face-API backend that drives the
  // liveness session and makes the anti-spoofing decision. faceComponentUrl =
  // Regula's own web component (self-hosted here); its WASM loads from
  // wasm.regulaforensics.com automatically, exactly like Regula's demo.
  // HTTPS only (TLS 1.3, post-quantum key exchange).
  faceServiceUrl: "https://face.verisec.mmose.me",
  faceComponentUrl: "/face/regula-face.iife.js",
  // Camera framing for the face steps. Read at page load, so tune and just
  // refresh the browser, NO rebuild needed.
  // These two are now INDEPENDENT (the frame no longer drags the circle):
  //   faceFrameWidth / faceFrameHeight - the visible box. Shrink freely; the
  //                      circle does NOT shrink with it. Keep height under ~320
  //                      so the box never scrolls.
  //   faceZoom         - the CIRCLE size. The camera window is rendered at
  //                      frame x faceZoom and clipped by the frame, and since
  //                      Regula sizes its oval from the window WIDTH, raising
  //                      this grows the circle while the frame stays put.
  //                      Circle diameter is about frameWidth x faceZoom x 0.375.
  //                      The head still fits at any value because object-fit is
  //                      `contain`, so the face and the oval scale together.
  //   faceOutsideColor / faceOutsideOpacity - the grey AROUND the circle
  //                      (0 = clear camera, 1 = solid grey). A real frosted
  //                      blur is NOT possible here: backdrop-filter on Regula's
  //                      SVG overlay ignores its oval mask and frosts the circle
  //                      too, killing the clear camera inside it.
  //   faceOvalCenterY  - where Regula puts the oval inside its own window,
  //                      measured from the top (~0.35). Raise it to push the
  //                      circle DOWN in the frame, lower it to push it UP.
  faceFrameWidth: 400,
  faceFrameHeight: 320,
  faceZoom: 1.7,
  faceOvalCenterY: 0.442,
  faceOutsideColor: "#bcc2c9",
  faceOutsideOpacity: 1,
  // Selfie-to-document face match (Document stage). similarity (0..1) at or above
  // this passes. 0.75 is Regula's recommended 1:1 verification threshold; raise
  // for stricter matching, lower only for softer webcam selfies.
  faceMatchThreshold: 0.75,
  // "Continue with Google" on the sign-in page. Needs the Google OAuth redirect set up for the
  // domain the site runs on; false hides the button.
  googleSignIn: true,
};
