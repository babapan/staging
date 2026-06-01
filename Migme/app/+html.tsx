import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: '100%', backgroundColor: '#070D1A' }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: 'html,body,#root{height:100%;min-height:100%;margin:0;background:#070D1A;}body{overflow:hidden;}*{box-sizing:border-box;}' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
