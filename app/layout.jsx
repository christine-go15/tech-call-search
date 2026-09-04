import './globals.css';
export const metadata = {
  title: 'Tech Call Library',
  description: 'Search past tech calls by keyword.',
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
<link href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}