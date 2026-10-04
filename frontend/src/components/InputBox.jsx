export function InputBox({ label, placeholder ,onChange}) {
  return (
    <div className="text-sm font-medium text-left py-2">
      {label}
      <input
        placeholder={placeholder}
        className="w-full px-2 py-1 border rounded border-slate-200"
        onChange={onChange}
      />
    </div>
  );
}
