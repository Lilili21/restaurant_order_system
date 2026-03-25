"use client";

export function MenuPageSkeleton() {
  return (
    <main className="page-shell menu-page">
      <section className="hero">
        <div>
          <div className="menu-skeleton__headline shimmer-block" />
          <div className="menu-skeleton__subline shimmer-block" />
          <div className="menu-skeleton__chips">
            <span className="menu-skeleton__chip shimmer-block" />
            <span className="menu-skeleton__chip shimmer-block" />
            <span className="menu-skeleton__chip shimmer-block" />
          </div>
        </div>
        <div className="menu-skeleton__action-card shimmer-panel">
          <div className="menu-skeleton__language shimmer-block" />
          <div className="menu-skeleton__button-row">
            <div className="menu-skeleton__button shimmer-block" />
            <div className="menu-skeleton__button shimmer-block" />
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="menu-skeleton__main">
          <div className="menu-skeleton__filters">
            <span className="menu-skeleton__filter shimmer-block" />
            <span className="menu-skeleton__filter shimmer-block" />
            <span className="menu-skeleton__filter shimmer-block" />
            <span className="menu-skeleton__filter shimmer-block" />
          </div>

          <div className="menu-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <article key={index} className="menu-card shimmer-panel menu-skeleton__card">
                <div className="menu-skeleton__image shimmer-block" />
                <div className="menu-card__body">
                  <div className="menu-skeleton__title shimmer-block" />
                  <div className="menu-skeleton__copy shimmer-block" />
                  <div className="menu-skeleton__copy shimmer-block menu-skeleton__copy--short" />
                </div>
                <div className="menu-card__footer">
                  <div className="menu-skeleton__price shimmer-block" />
                  <div className="menu-skeleton__cta shimmer-block" />
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="cart-panel shimmer-panel menu-skeleton__cart">
          <div className="menu-skeleton__panel-title shimmer-block" />
          <div className="menu-skeleton__row shimmer-block" />
          <div className="menu-skeleton__row shimmer-block menu-skeleton__row--short" />
          <div className="menu-skeleton__cta menu-skeleton__cta--wide shimmer-block" />
          <div className="menu-skeleton__submitted shimmer-panel">
            <div className="menu-skeleton__panel-title shimmer-block" />
            <div className="menu-skeleton__row shimmer-block" />
            <div className="menu-skeleton__row shimmer-block menu-skeleton__row--short" />
          </div>
        </aside>
      </section>
    </main>
  );
}
