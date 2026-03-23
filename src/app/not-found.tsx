export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        fontFamily: "Georgia, serif",
        color: "#2d1d14"
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ marginBottom: "12px" }}>Page not found</h1>
        <p>Check the address and try again.</p>
      </div>
    </main>
  );
}
