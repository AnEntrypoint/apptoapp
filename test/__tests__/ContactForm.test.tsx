import { render, screen } from '@testing-library/react';
import ContactForm from '../components/ContactForm.tsx';

describe('ContactForm', () => {
  it('renders form elements correctly', () => {
    render(<ContactForm />);
    const form = screen.getByRole('form');
    expect(form).toBeInTheDocument();
    // Add more specific form element tests
  });
});