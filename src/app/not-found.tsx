export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        fontFamily: "Georgia, serif",
        background: "#f5efe6",
        color: "#2d1d14"
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ marginBottom: "12px" }}>Страница не найдена</h1>
        <p>Проверьте адрес и попробуйте ещё раз.</p>
      </div>
    </main>
  );
}
