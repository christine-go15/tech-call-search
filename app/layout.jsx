import './globals.css';

export const metadata = {
  title: 'Tech Call Library',
  description: 'Search past tech calls by keyword.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
