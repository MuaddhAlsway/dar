import ContactForm from './components/ContactForm.jsx';

/**
 * Landing page layout:
 * hero images -> contact form section -> footer image.
 */
function App() {
  return (
    <>
      <img src="/img1.jpeg" alt="" aria-hidden="true" />
      <img src="/img2.jpeg" alt="" aria-hidden="true" />
      <img src="/img3.jpeg" alt="" aria-hidden="true" />

      <img src="/footer.jpeg" alt="" aria-hidden="true" />

      <ContactForm />

      <footer></footer>
    </>
  )
}

export default App
