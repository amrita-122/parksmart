import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Landing page for the backend's redirect-based Google login: reads the token
// from the URL fragment, stores it and goes home.
export default function GoogleCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (token) {
      localStorage.setItem("token", token);
      window.history.replaceState(null, "", window.location.pathname);
      navigate("/", { replace: true });
    } else {
      navigate("/signin", { replace: true });
    }
  }, [navigate]);

  return <p className="p-6">Signing you in...</p>;
}
