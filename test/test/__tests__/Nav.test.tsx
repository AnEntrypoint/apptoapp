import { render, screen } from '@testing-library/react';
import Nav from '../components/Nav.tsx';

describe('Nav', () => {
  it('renders navigation links', () => {
    render(<Nav />);
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });
});