import { Fragment, useEffect, useId } from 'react';
import { useData } from './data';
import { donorsByYear, type Donor } from './about';

// Public «Nosotros» page. Its texts and the donors come from the admin panel.
export function AboutPage() {
  const { about, donors } = useData();
  const headingId = useId();
  const ready = !!about && !!donors;
  useEffect(() => {
    // The nav and other pages can link straight to the donors.
    if (ready && window.location.hash === '#donaciones')
      document.getElementById('donaciones')?.scrollIntoView();
  }, [ready]);
  if (!about)
    return (
      <main className="container page-section" role="status">
        Cargando…
      </main>
    );
  const years = donorsByYear(donors ?? []);
  return (
    <main className="about-page">
      <div className="container about-intro">
        <h1>{about.title}</h1>
        {about.lead && <p className="about-lead">{about.lead}</p>}
      </div>
      {about.sections.length > 0 && (
        <div className="container about-sections">
          {about.sections.map((section, index) => (
            <section className="about-section" key={index}>
              <h2>{section.title}</h2>
              <div className="about-body">
                <RichText text={section.body} />
              </div>
            </section>
          ))}
        </div>
      )}
      <section
        id="donaciones"
        className="donor-wall"
        aria-labelledby={headingId}
      >
        <PaintEdge />
        <div className="container">
          <div className="donor-wall-head">
            <div>
              <h2 id={headingId}>Donaciones</h2>
              <div className="donor-wall-intro">
                <RichText text={about.donationsIntro} />
              </div>
            </div>
            {about.donationsHow && (
              <aside className="donate-how">
                <h3>Cómo donar</h3>
                <RichText text={about.donationsHow} />
              </aside>
            )}
          </div>
          {years.map(({ year, organizations, people }) => (
            <section
              className="donor-year"
              key={year}
              aria-label={`Donaron en ${year}`}
            >
              <h3>{year}</h3>
              <div className="donor-names">
                {organizations.length > 0 && (
                  <ul className="donor-organizations">
                    {organizations.map((donor) => (
                      <DonorName donor={donor} key={donor._id} />
                    ))}
                  </ul>
                )}
                {people.length > 0 && (
                  <ul className="donor-people">
                    {people.map((donor) => (
                      <DonorName donor={donor} key={donor._id} />
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}

function DonorName({ donor }: { donor: Donor }) {
  return (
    <li>
      {donor.url ? (
        <a href={donor.url} target="_blank" rel="noopener noreferrer">
          {donor.name}
        </a>
      ) : (
        <span>{donor.name}</span>
      )}
      {donor.note && <small>{donor.note}</small>}
    </li>
  );
}

// The uneven upper edge a paint roller leaves on a wall.
function PaintEdge() {
  return (
    <svg
      className="paint-edge"
      viewBox="0 0 1200 60"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <filter id="paint-rough" x="-2%" y="-40%" width="104%" height="180%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.035 0.6"
          numOctaves="2"
          seed="7"
        />
        <feDisplacementMap in="SourceGraphic" scale="14" />
      </filter>
      <path
        filter="url(#paint-rough)"
        d="M-20 80V30L150 27V14L318 17V36L512 33V20L676 22V42L872 39V16L1034 19V31L1220 28V80Z"
      />
    </svg>
  );
}

const LINK = /(https?:\/\/[^\s<>"]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;
// Plain text from the admin panel: blank lines separate paragraphs, and web
// addresses and emails become links. No markup is interpreted.
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph, index) => (
          <p className="preserve-lines" key={index}>
            {paragraph
              .trim()
              .split(LINK)
              .map((part, i) => {
                if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
                // Sentence punctuation after an address is not part of it.
                const link = part.replace(/[.,;:!?)]+$/, '');
                const web = link.startsWith('http');
                return (
                  <Fragment key={i}>
                    <a
                      className="text-link"
                      href={web ? link : `mailto:${link}`}
                      {...(web
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                    >
                      {web ? link.replace(/^https?:\/\/(www\.)?/, '') : link}
                    </a>
                    {part.slice(link.length)}
                  </Fragment>
                );
              })}
          </p>
        ))}
    </>
  );
}
