import { Hero } from '@/components/Hero';
import { Portfolio } from '@/components/Portfolio';
import { Nav } from '@/components/Nav';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Nav />
      <Hero />
      <Portfolio />
    </main>
  );
}