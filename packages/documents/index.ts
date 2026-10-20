// @excise/documents: everything the main process needs from Member D's package.
export * from './engine/index.ts';
export * from './generation/index.ts';
export * from './print-layouts/index.ts';
export {
  JsonTemplateSource,
  REGISTRY_FILE,
  TemplateRegistry,
  type TemplateEntry,
  type TemplateFamily,
  type TemplateSource,
  type TemplateStatus,
  type TemplateVariant,
} from './registry/registry.ts';
export {
  DocumentsService,
  type DialogData,
  type DialogGroup,
  type DialogResult,
  type DialogTemplate,
  type DocumentsServiceDeps,
  type WarningCode,
} from './dialog/documents-service.ts';
