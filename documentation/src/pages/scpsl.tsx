import type { ReactNode } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';

export default function ScpSlPage(): ReactNode {
  return (
    <Layout title="SCP:SL" description="SCP:SL Dokumentation von Zeitvertreib.">
      <main className="container margin-vert--xl">
        <Heading as="h1">SCP:SL</Heading>
        <p>Dieser Bereich wird aktuell aufgebaut.</p>
        <p>
          <Link to="/docs/intro">Zur Dokumentation</Link>
        </p>
      </main>
    </Layout>
  );
}
