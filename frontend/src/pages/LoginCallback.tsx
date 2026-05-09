import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export function LoginCallback() {
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get("token");
    const err = searchParams.get("error");

    if (err) {
      setError(decodeURIComponent(err));
      return;
    }

    if (token) {
      localStorage.setItem("shop_token", token);
      navigate("/products", { replace: true });
    } else {
      setError("No token received");
    }
  }, [location, navigate]);

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#ff5555" }}>
        <h2>Login Failed</h2>
        <p style={{ marginBottom: "1rem" }}>{error}</p>
        <button
          onClick={() => navigate("/login")}
          style={{
            background: "transparent",
            color: "inherit",
            border: "1px solid currentColor",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "4rem",
        textAlign: "center",
        color: "var(--text-secondary)",
      }}
    >
      <p>Completing login...</p>
    </div>
  );
}
