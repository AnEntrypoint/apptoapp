import { render } from '@testing-library/react';
import Nav from '../components/Nav';
import Portfolio from '../components/Portfolio';
import ContactForm from '../components/ContactForm';

test('renders Nav component', () => {
  const { getByText } = render(<Nav />);
  expect(getByText('Home')).toBeInTheDocument();
  expect(getByText('Portfolio')).toBeInTheDocument();
  expect(getByText('Contact')).toBeInTheDocument();
});

test('renders Portfolio component', () => {
  const { getByText } = render(<Portfolio />);
  expect(getByText('Portfolio')).toBeInTheDocument();
});

test('renders ContactForm component', () => {
  const { getByLabelText } = render(<ContactForm />);
  expect(getByLabelText('Name')).toBeInTheDocument();
  expect(getByLabelText('Email')).toBeInTheDocument();
  expect(getByLabelText('Message')).toBeInTheDocument();
});
