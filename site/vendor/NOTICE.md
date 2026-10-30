# Bundled OCR runtime

- Tesseract.js 6.0.1: `tesseract.min.js`, `worker.min.js` (Apache-2.0).
- tesseract.js-core 6.0.0: `tesseract-core-lstm.wasm.js`, including its embedded WASM (Apache-2.0).
- @tesseract.js-data/eng 1.0.0: `4.0.0_best_int/eng.traineddata.gz` (Apache-2.0).

Packages were retrieved from their pinned npm tarballs. License texts are provided alongside these files and in the distributable ZIP.

**Local worker modification:** the language initialization mapping for in-memory language objects uses `t.code` instead of `t.data`. In the published worker, the load step correctly writes `code.traineddata`, but the initialize step mistakenly passes the binary bytes as the language name. This one-expression fix lets the bundled model initialize entirely from memory without CDN requests. No other worker code was changed. The main runtime and core are otherwise unmodified.
