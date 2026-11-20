/** The profile screen and its appearance card. */
export default {
  header: {
    title: 'Profile',
    description: "The account you are signed in with, and this browser's appearance.",
  },
  account: {
    title: 'Your account',
    email: 'Email',
    role: 'Role',
    organization: 'Organization',
    serverEnforces:
      'Access to application data is enforced by the server, scoped to this organization.',
  },
  appearance: {
    title: 'Appearance',
    description:
      'Theme and layout direction for this browser; stored locally and never sent to the server.',
    themeLegend: 'Theme',
    light: { label: 'Light', detail: 'White surfaces with the indigo signal' },
    dark: { label: 'Dark', detail: 'Nexus Slate on a deep canvas' },
    themeAria: 'Theme',
    languageLegend: 'Language & direction',
    languageAria: 'Language & direction',
    english: { label: 'English', detail: 'Layout runs from left to right' },
    arabic: { label: 'العربية', detail: 'Layout runs from right to left' },
    helpText:
      'Light and dark are the two themes; English lays the interface out left to right, Arabic mirrors it right to left.',
  },
};
