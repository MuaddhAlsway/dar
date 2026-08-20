function App() {
  return (
    <>
      <img src="/img.jpeg" alt="img1" />
      <img src="/img2.jpeg" alt="img2" />
      <img src="/img3.jpeg" alt="img3" />

      <form>
        <h2>تواصل معنا</h2>
        <div>
          <label htmlFor="name">الإسم</label>
          <input type="text" id="name" name="name" required />
        </div>
        <div>
          <label htmlFor="email">الإيميل</label>
          <input type="email" id="email" name="email" required />
        </div>
        <div>
          <label htmlFor="phone">رقم الجوال</label>
          <input type="tel" id="phone" name="phone" required />
        </div>
        <button type="submit">إرسال</button>
      </form>

      <img src="/img4.jpeg" alt="footer" />

      <footer></footer>
    </>
  )
}

export default App
