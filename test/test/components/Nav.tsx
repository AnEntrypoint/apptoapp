export function Nav() {
  return (
    <nav className="fixed top-0 w-full bg-white shadow-md z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Artist Portfolio</h1>
          <div className="hidden md:flex space-x-6">
            <a href="#home" className="hover:text-gray-600">Home</a>
            <a href="#portfolio" className="hover:text-gray-600">Portfolio</a>
            <a href="#about" className="hover:text-gray-600">About</a>
            <a href="#contact" className="hover:text-gray-600">Contact</a>
          </div>
        </div>
      </div>
    </nav>
  );
}