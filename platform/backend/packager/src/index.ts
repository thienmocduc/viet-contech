// ===============================================================
// Output Packager — public exports
// ===============================================================

export * from './types.js';
export {
  DELIVERABLE_MANIFEST,
  REQUIRED_CODES,
  TOTAL_DELIVERABLES,
  SCHEMA_VERSION,
  reconcileManifest,
  buildIndexRows,
  indexRowsToCsv,
  buildReadme,
} from './manifest-builder.js';
export { sanitizeVi, slugify, buildFileName, buildDeliverableFileName, buildZipFileName, buildRenderFileName } from './file-naming.js';
export { sha256File, sha256Buffer, buildChecksumManifest, renderSha256SumFile, verifyManifest, verifyEntry, buildEntry } from './checksum.js';
export { buildEmbedMetadata, writeMetadataSidecar, buildDwgTitleBlock, buildPdfInfoDict, buildIfcHeader, buildXlsxCoreProps } from './metadata-embed.js';
export { generatePreview, generatePreviewsBatch, getPreviewSpec, previewPathOf } from './preview-generator.js';
export { buildPermitPackage, buildPermitChecklist, renderForm01Text, renderEnvCommitmentText, renderDesignContractText } from './permit-builder.js';
export { buildZipPackage } from './zip-builder.js';
export { buildPackagerApp } from './api.js';
