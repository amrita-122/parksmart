export function Button({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="w-full text-white bg-gray-800 py-2 px-2 rounded-md my-2 "
    >
      {label}
    </button>
  );
}
