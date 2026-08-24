import { useState } from 'react';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Empty state of the form - also used to reset after a successful send. */
const INITIAL_VALUES = { name: '', email: '', phone: '', message: '' };

/** Pragmatic email pattern - mirrors the backend rule. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Phone: digits with optional separators (+ spaces ( ) - .), min 7 digits. */
const PHONE_REGEX = /^[+()\-.\s\d]+$/;

/** Field limits - kept in sync with api/contact.js. */
const LIMITS = {
  nameMin: 2,
  nameMax: 100,
  messageMin: 10,
  messageMax: 5000,
};

/**
 * Validate a single field.
 * @returns {string} Arabic error message, or '' when the value is valid.
 */
function validateField(field, rawValue) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';

  switch (field) {
    case 'name':
      if (!value) return 'يرجى إدخال الاسم الكامل.';
      if (value.length < LIMITS.nameMin || value.length > LIMITS.nameMax)
        return `الاسم يجب أن يكون بين ${LIMITS.nameMin} و ${LIMITS.nameMax} حرفًا.`;
      return '';

    case 'email':
      if (!value) return 'يرجى إدخال البريد الإلكتروني.';
      if (!EMAIL_REGEX.test(value)) return 'صيغة البريد الإلكتروني غير صحيحة.';
      return '';

    case 'phone': {
      const digits = value.replace(/\D/g, '');
      if (!value) return 'يرجى إدخال رقم الجوال.';
      if (!PHONE_REGEX.test(value) || digits.length < 7 || digits.length > 15)
        return 'صيغة رقم الجوال غير صحيحة.';
      return '';
    }

    case 'message':
      if (!value) return 'يرجى كتابة رسالتك.';
      if (value.length < LIMITS.messageMin || value.length > LIMITS.messageMax)
        return `الرسالة يجب أن تكون بين ${LIMITS.messageMin} و ${LIMITS.messageMax} حرفًا.`;
      return '';

    default:
      return '';
  }
}

/** Validate every field at once. @returns {object} map of field -> error. */
function validateAll(values) {
  const errors = {};
  for (const field of Object.keys(INITIAL_VALUES)) {
    const error = validateField(field, values[field]);
    if (error) errors[field] = error;
  }
  return errors;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * Accessible contact form.
 * States: idle -> sending -> success | error
 * - Client-side validation on blur + submit.
 * - Submit button disabled while the request is in flight.
 * - Form resets and shows a success banner once the API confirms delivery.
 */
export default function ContactForm() {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const [feedback, setFeedback] = useState(''); // top-level success/error message

  /** Controlled input change handler; clears the field error while typing. */
  function handleChange(event) {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  /** Validate one field when the user leaves it. */
  function handleBlur(event) {
    const { name, value } = event.target;
    const error = validateField(name, value);
    setErrors((prev) => ({ ...prev, [name]: error }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    /* Re-validate everything before hitting the API. */
    const validationErrors = validateAll(values);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      // Move focus to the first invalid field for keyboard/screen-reader users.
      const firstInvalid = Object.keys(validationErrors)[0];
      document.getElementById(`contact-${firstInvalid}`)?.focus();
      return;
    }

    setStatus('sending');
    setFeedback('');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
          message: values.message.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        /* Success: reset the form and show confirmation. */
        setValues(INITIAL_VALUES);
        setErrors({});
        setStatus('success');
        setFeedback(
          data.message ||
            'تم إرسال رسالتك بنجاح، وسنتواصل معك في أقرب وقت.'
        );
        return;
      }

      if (response.status === 400 && data.errors) {
        /* Server-side validation errors - surface them per field. */
        setErrors(data.errors);
        setStatus('error');
        setFeedback(data.message || 'يرجى تصحيح الحقول المحددة ثم إعادة المحاولة.');
        return;
      }

      /* Any other failure (405/413/415/500/network). */
      setStatus('error');
      setFeedback(
        data.message || 'حدث خطأ أثناء الإرسال، يرجى المحاولة مرة أخرى.'
      );
    } catch {
      setStatus('error');
      setFeedback('تعذر الاتصال بالخادم، تحقق من اتصالك ثم حاول مجددًا.');
    }
  }

  const isSending = status === 'sending';

  return (
    <section className="contact" id="contact" aria-labelledby="contact-title">
      <h2 id="contact-title" className="contact__title">
        تواصل معنا
      </h2>
      <p className="contact__subtitle">املأ النموذج التالي وسيتم التواصل معك</p>

      {/* Live region announced by screen readers for status changes. */}
      <div aria-live="polite">
        {status === 'success' && (
          <p className="contact-banner contact-banner--success" role="status">
            {feedback}
          </p>
        )}
        {status === 'error' && (
          <p className="contact-banner contact-banner--error" role="alert">
            {feedback}
          </p>
        )}
      </div>

      <form className="contact-form" onSubmit={handleSubmit} noValidate>
        {/* Full Name */}
        <div className="contact-form__field">
          <label htmlFor="contact-name">الاسم الكامل</label>
          <input
            type="text"
            id="contact-name"
            name="name"
            autoComplete="name"
            placeholder="مثال: أحمد محمد"
            maxLength={LIMITS.nameMax + 1}
            value={values.name}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={isSending}
            aria-required="true"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'contact-name-error' : undefined}
            className={errors.name ? 'is-invalid' : ''}
          />
          {errors.name && (
            <p className="contact-form__error" id="contact-name-error">
              {errors.name}
            </p>
          )}
        </div>

        {/* Email Address */}
        <div className="contact-form__field">
          <label htmlFor="contact-email">البريد الإلكتروني</label>
          <input
            type="email"
            id="contact-email"
            name="email"
            dir="ltr"
            autoComplete="email"
            placeholder="name@example.com"
            value={values.email}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={isSending}
            aria-required="true"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'contact-email-error' : undefined}
            className={errors.email ? 'is-invalid' : ''}
          />
          {errors.email && (
            <p className="contact-form__error" id="contact-email-error">
              {errors.email}
            </p>
          )}
        </div>

        {/* Phone Number */}
        <div className="contact-form__field">
          <label htmlFor="contact-phone">رقم الجوال</label>
          <input
            type="tel"
            id="contact-phone"
            name="phone"
            dir="ltr"
            autoComplete="tel"
            placeholder="+9665XXXXXXXX"
            value={values.phone}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={isSending}
            aria-required="true"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? 'contact-phone-error' : undefined}
            className={errors.phone ? 'is-invalid' : ''}
          />
          {errors.phone && (
            <p className="contact-form__error" id="contact-phone-error">
              {errors.phone}
            </p>
          )}
        </div>

        {/* Message */}
        <div className="contact-form__field">
          <label htmlFor="contact-message">رسالتك</label>
          <textarea
            id="contact-message"
            name="message"
            rows={5}
            placeholder="اكتب رسالتك هنا..."
            maxLength={LIMITS.messageMax + 1}
            value={values.message}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={isSending}
            aria-required="true"
            aria-invalid={Boolean(errors.message)}
            aria-describedby={
              errors.message ? 'contact-message-error' : undefined
            }
            className={errors.message ? 'is-invalid' : ''}
          />
          {errors.message && (
            <p className="contact-form__error" id="contact-message-error">
              {errors.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="contact-form__submit"
          disabled={isSending}
          aria-busy={isSending}
        >
          {isSending ? 'جارٍ الإرسال…' : 'إرسال الرسالة'}
        </button>
      </form>
    </section>
  );
}
