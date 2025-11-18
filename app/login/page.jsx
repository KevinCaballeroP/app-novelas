"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "../../style/AdminLogin.css";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
  e.preventDefault();
  setError("");

  const url = isRegister ? "/api/register" : "/api/login";
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    setError(data.error);
    return;
  }

  if (isRegister) {
    alert("Usuario registrado. Ahora inicia sesión.");
    setIsRegister(false);
    return;
  }

  // Login OK
  sessionStorage.setItem("adminAuth", "true");
  sessionStorage.setItem("adminUser", data.username);

  router.push("/admin");
};


  return (
    <main className="login-container">
      <div className="login-card">
        <h1 className="login-title">
          {isRegister ? "Registro de Administrador" : "Login Administrador"}
        </h1>

        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="text"
            placeholder="Usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="login-input"
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="login-input"
            required
          />
          <button type="submit" className="login-button">
            {isRegister ? "Registrar" : "Entrar"}
          </button>
        </form>

        {error && <p className="login-error">{error}</p>}

        <p
          className="login-toggle"
          onClick={() => {
            setIsRegister(!isRegister);
            setError("");
          }}
        >
          {isRegister
            ? "¿Ya tienes cuenta? Inicia sesión"
            : "¿No tienes cuenta? Regístrate aquí"}
        </p>
      </div>
    </main>
  );
}
