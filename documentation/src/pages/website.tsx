import type {ReactNode} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';

export default function WebsitePage(): ReactNode {
  return (
    <Layout title="Website" description="Website Dokumentation von Zeitvertreib.">
      <main className="container margin-vert--xl">
        <Heading as="h1">Website</Heading>
        <p>Dieser Bereich wird aktuell aufgebaut.</p>
        <p>
          <Link to="/docs/intro">Zur Dokumentation</Link>
        </p>
      </main>
    </Layout>
  );
}
