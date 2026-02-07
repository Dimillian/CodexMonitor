module.exports = {
  contextSeparator: '.',
  createOldCatalogs: false,
  defaultNamespace: 'common',
  locales: ['en', 'zh', 'es', 'fr', 'de'],
  namespaceSeparator: ':',
  keySeparator: '.',
  pluralSeparator: '_',
  interpolation: {
    prefix: '{{',
    suffix: '}}'
  },
  react: {
    componentFolderBlacklist: ['**/node_modules/**', '**/.git/**'],
    componentNames: ['Trans', 'Translation'],
    hookNames: ['useTranslation'],
    i18nKeySeparator: false,
    defaultNS: 'common'
  },
  output: 'src/i18n/resources/{{lng}}/{{ns}}.json'
};
