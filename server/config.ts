// server/config.ts — per-instance personalization. Every deployment of Atlas
// (Jeff's, Lacy's, ...) sets these env vars; defaults keep Jeff's instance
// working unchanged.

const name = process.env.USER_NAME || 'Jeff Williams';

export const USER = {
  name,
  firstName: name.split(' ')[0] || 'there',
  // One sentence of who the user is — used in every assistant system prompt
  bio: process.env.USER_BIO || 'Jeff Williams is the CEO of Exum Instruments, a deep-tech mass spectrometry startup in Denver, CO.',
  // Email sign-off ("Cheers" → "Cheers,\nJeff")
  signoff: process.env.USER_SIGNOFF || 'Cheers',
  // IANA timezone for all date/time handling
  tz: process.env.USER_TZ || 'America/Denver',
  // Assistant display name
  assistant: process.env.ASSISTANT_NAME || 'Adler',
} as const;
