function App() {
  return (
    <>
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

      <footer></footer>
    </>
  )
}

export default App
