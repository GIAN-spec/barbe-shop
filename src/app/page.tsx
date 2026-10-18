'use client'

// El sitio completo de "Chino Barber Shop" vive en /public/index.html como un
// archivo único y autónomo (HTML + CSS + JS puro, sin frameworks), tal como se
// solicitó. Aquí lo embebemos en la ruta "/" mediante un iframe a pantalla
// completa para que se visualice correctamente en el panel de preview.
export default function Home() {
  return (
    <iframe
      src="/index.html"
      title="Chino Barber Shop — Reservas en línea"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
        margin: 0,
        padding: 0,
        display: 'block',
      }}
    />
  )
}
