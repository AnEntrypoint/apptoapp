export function Hero() {
  return (
    <section id="home" className="pt-20 min-h-screen flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500">
      <div className="text-center text-white">
        <h1 className="text-5xl md:text-7xl font-bold mb-4">Welcome to My Portfolio</h1>
        <p className="text-xl md:text-2xl mb-8">Exploring the boundaries of artistic expression</p>
        <a href="#portfolio" className="bg-white text-purple-500 px-8 py-3 rounded-full font-semibold hover:bg-opacity-90 transition-all">
          View My Work
        </a>
      </div>
    </section>
  );
}