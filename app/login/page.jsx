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

  const handleSubmit = (e) => {
    e.preventDefault();

    const users = JSON.parse(localStorage.getItem("adminUsers") || "[]");

    if (isRegister) {
      // Evitar duplicados
      if (users.find((u) => u.username === username)) {
        setError("El usuario ya existe");
        return;
      }

      // Registrar nuevo usuario
      users.push({ username, password });
      localStorage.setItem("adminUsers", JSON.stringify(users));
      setError("");
      alert("Usuario registrado con éxito. Ahora puedes iniciar sesión.");
      setIsRegister(false);
      setUsername("");
      setPassword("");
    } else {
      // Login
      const user = users.find(
        (u) => u.username === username && u.password === password
      );

      if (user) {
        sessionStorage.setItem("adminAuth", "true");
        router.push("/admin");
      } else {
        setError("Usuario o contraseña incorrectos");
      }
    }
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
