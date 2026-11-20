import 'i18next';

/**
 * i18next is used with dynamic keys throughout the application (e.g.
 * `t(\`shell.sidebar.entries.${key}\`)`), so the instance is deliberately left
 * untyped: this file only registers the default namespace marker. Keeping a
 * hand-maintained key union would fight the code rather than help it.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
  }
}
