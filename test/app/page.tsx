import React from 'react';
import Nav from '../components/Nav';
import Portfolio from '../components/Portfolio';
import ContactForm from '../components/ContactForm';

const HomePage: React.FC = () => {
  return (
    <div>
      <Nav />
      <Portfolio />
      <ContactForm />
    </div>
  );
};

export default HomePage;