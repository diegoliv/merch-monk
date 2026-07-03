import { Logo } from "./Logo";

export function Header() {
  return (
    <header className="site-header">
      <a className="logo-link" href="#hero" aria-label="Merch Monk home">
        <Logo />
      </a>
      <div className="header-actions">
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#ordering">Catalog</a>
          <a className="nav-with-icon" href="#options">
            Solutions
            <svg width="12" height="7" viewBox="0 0 14 8" aria-hidden="true">
              <path d="M1 1L7 7L13 1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a href="#minutes">Book a demo</a>
        </nav>
        <a className="button button-primary header-cta" href="#ordering">Create Merch</a>
        <button className="menu-button" type="button" aria-label="Open menu">
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}