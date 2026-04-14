import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const featureCards = [
    {
      title: 'SCP: Secret Laboratory',
      description:
        'Hier beschreiben wir unsere installierten Plugins, Serverinfrastruktur, Tips und Tricks für Anfänger, sowie Regeln und Richtlinien für die Community.',
      to: '/scpsl',
      className: clsx(styles.card),
    },
    {
      title: 'Zeitvertreib Website',
      description:
        'Ein Benutzerhandbuch um häufige Fragen zu beantworten die bei der Verwendung unserer Website auftreten können!',
      to: '/website',
      className: clsx(styles.card),
    },
    {
      title: 'Entwicklungsleitfaden',
      description: 'Entwicklungsleitfaden ist in Vorbereitung und wird bald verfügbar sein.',
      disabled: true,
      className: clsx(styles.card, styles.cardLower),
    },
  ];

  return (
    <header className={styles.heroBanner}>
      <div className={styles.gridBackground} aria-hidden="true" />
      <div className={clsx('container', styles.heroContainer)}>
        <Heading as="h1" className={styles.heroTitle}>
          Zeitvertreib Wiki
        </Heading>
        <p className={styles.heroSubtitle}>
          Zentrale Dokumentation für alle Projekte, Systeme und Entwicklungsablaufe von Zeitvertreib.
        </p>
        <div className={styles.cardLayout}>
          {featureCards.map((card) =>
            card.disabled ? (
              <article
                key={card.title}
                className={clsx(card.className, styles.cardButton, styles.cardButtonDisabled)}
                aria-disabled="true"
              >
                <h3 className={styles.cardTitle}>{card.title}</h3>
                <p className={styles.cardText}>{card.description}</p>
              </article>
            ) : (
              <Link key={card.title} className={clsx(card.className, styles.cardButton)} to={card.to ?? '/docs/intro'}>
                <h3 className={styles.cardTitle}>{card.title}</h3>
                <p className={styles.cardText}>{card.description}</p>
              </Link>
            ),
          )}
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const context = useDocusaurusContext();
  const siteConfig = context.siteConfig;

  return (
    <Layout title={siteConfig.title} description="Die offizielle Dokumentation für alle Projekte von Zeitvertreib.">
      <HomepageHeader />
      <main />
    </Layout>
  );
}
