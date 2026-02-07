import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

export default function App() {
  const [aba, setAba] = useState("Matérias");
  const [materias, setMaterias] = useState([]);
  const [novaMat, setNovaMat] = useState("");
  const [tempo, setTempo] = useState(0);
  const [rodando, setRodando] = useState(false);
  const [buscaFlash, setBuscaFlash] = useState("");
  const [flashcards, setFlashcards] = useState([]);
  const [sessoes, setSessoes] = useState([]);
  const [expandidas, setExpandidas] = useState({});
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [usuario, setUsuario] = useState(null);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(true);

  const timerRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUsuario(session?.user ?? null);
      setCarregando(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUsuario(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (usuario) carregarTudo();
  }, [usuario]);

  useEffect(() => {
    if (rodando) {
      timerRef.current = setInterval(() => {
        setTempo((t) => t + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [rodando]);

  async function lidarAuth(tipo) {
    if (!email || !senha) return alert("Preencha email e senha!");
    const { error } = tipo === 'login' 
      ? await supabase.auth.signInWithPassword({ email, password: senha })
      : await supabase.auth.signUp({ email, password: senha });
    if (error) alert(error.message);
    else if (tipo === 'cadastro') alert("Conta criada! Verifique seu e-mail.");
  }

  const alternarMateria = (id) => {
    setExpandidas(prev => ({ ...prev, [id]: !prev[id] }));
  };

  async function carregarTudo() {
    try {
      const { data: mats } = await supabase.from("materias").select("*, temas(*, anexos(*))");
      const { data: sess } = await supabase.from("sessoes_estudo").select("*").order("data_estudo", { ascending: false });
      const { data: flash } = await supabase.from("flashcards").select("*").order("criado_em", { ascending: false });
      setMaterias(mats || []);
      setSessoes(sess || []);
      setFlashcards(flash || []);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    }
  }

  async function anexarArquivo(temaId, file) {
    if (!file) return;
    const nomeLimpo = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.\-]/g, "_");
    const nomeNoStorage = `${usuario.id}/${temaId}/${Date.now()}-${nomeLimpo}`;
    try {
      const { error: uploadError } = await supabase.storage.from("anexos").upload(nomeNoStorage, file, {
        contentType: file.type,
        upsert: true
      });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("anexos").getPublicUrl(nomeNoStorage);
      await supabase.from("anexos").insert([{
        tema_id: temaId,
        nome_arquivo: file.name,
        url: data.publicUrl,
        user_id: usuario.id
      }]);
      carregarTudo();
    } catch (err) {
      alert("Erro no upload: " + err.message);
    }
  }

  async function deletarAnexo(id) {
    if (!confirm("Excluir este arquivo?")) return;
    await supabase.from("anexos").delete().eq("id", id);
    carregarTudo();
  }

  async function zerarHistorico() {
    const confirmacao = confirm("Deseja realmente apagar TODO o histórico de sessões de estudo?");
    if (confirmacao) {
      const senhaConfirm = prompt("Para confirmar a exclusão permanente, digite DELETAR:");
      if (senhaConfirm === "DELETAR") {
        const { error } = await supabase.from("sessoes_estudo").delete().eq("user_id", usuario.id);
        if (error) alert("Erro: " + error.message);
        else { alert("Histórico removido! 🧹"); carregarTudo(); }
      }
    }
  }

  async function criarMateria() {
    if (!novaMat) return;
    const { error } = await supabase.from("materias").insert([{ nome: novaMat, user_id: usuario.id }]);
    if (error) alert("Erro ao salvar matéria: " + error.message);
    setNovaMat("");
    carregarTudo();
  }

  async function criarTema(materiaId) {
    const input = document.getElementById(`input-tema-${materiaId}`);
    if (!input?.value) return;
    await supabase.from("temas").insert([{ materia_id: materiaId, nome: input.value, user_id: usuario.id }]);
    input.value = "";
    carregarTudo();
  }

  async function salvarSessao() {
    if (tempo < 1) return;
    setRodando(false);
    const { error } = await supabase.from("sessoes_estudo").insert([{ segundos_totais: tempo, user_id: usuario.id }]); 
    if (error) alert("Erro ao salvar sessão: " + error.message);
    else { setTempo(0); alert("Sessão de estudo salva com sucesso! 🚀"); carregarTudo(); }
  }

  async function criarFlashcard(e) {
    e.preventDefault();
    const form = e.target;
    const novoCard = { 
        tema: form.tema.value, 
        pergunta: form.pergunta.value, 
        resposta: form.resposta.value,
        user_id: usuario.id
    };
    const { error } = await supabase.from("flashcards").insert([novoCard]);
    if (error) alert("Erro ao salvar: " + error.message);
    else { form.reset(); carregarTudo(); alert("Flashcard adicionado!"); }
  }

  async function deletarFlashcard(id) {
    if (!confirm("Excluir este flashcard?")) return;
    await supabase.from("flashcards").delete().eq("id", id);
    carregarTudo();
  }

  async function deletarMateria(e, id) {
    e.stopPropagation();
    if (!confirm("Excluir matéria e tudo dentro dela?")) return;
    await supabase.from("materias").delete().eq("id", id);
    carregarTudo();
  }

  const formatar = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const seg = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
  };

  const sessoesFiltradas = sessoes.filter(s => {
    if (!dataInicio && !dataFim) return true;
    const dataSessao = s.data_estudo ? s.data_estudo.split('T')[0] : "";
    if (dataInicio && dataFim) return dataSessao >= dataInicio && dataSessao <= dataFim;
    if (dataInicio) return dataSessao >= dataInicio;
    if (dataFim) return dataSessao <= dataFim;
    return true;
  });

  const filtroDatasAtivo = dataInicio !== "" && dataFim !== "";
  const totalSegundosFiltrados = filtroDatasAtivo 
    ? sessoesFiltradas.reduce((acc, s) => acc + (s.segundos_totais || 0), 0)
    : 0;

  if (carregando) return <div className="container" style={{color: 'white', textAlign: 'center', marginTop: '50px'}}>Iniciando StudyFlow...</div>;

  if (!usuario) {
    return (
      <div className="container">
        <h1 className="title">STUDYFLOW</h1>
        <div className="materia-card" style={{padding: '30px', maxWidth: '400px', margin: '40px auto'}}>
          <h2 style={{color: 'white', marginTop: 0, textAlign: 'center'}}>Acessar Conta</h2>
          <input className="input-main" style={{width: '90%', marginBottom: '10px'}} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="input-main" style={{width: '90%', marginBottom: '20px'}} type="password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} />
          <div style={{display: 'flex', gap: '10px'}}>
            <button className="btn-save" style={{flex: 1}} onClick={() => lidarAuth('login')}>Entrar</button>
            <button className="btn-create" style={{flex: 1, background: '#444'}} onClick={() => lidarAuth('cadastro')}>Cadastrar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '30px', width: '100%' }}>
        <h1 className="title" style={{ margin: 0 }}>STUDYFLOW</h1>
        <button onClick={() => supabase.auth.signOut()} style={{ position: 'absolute', right: 0, background: 'none', border: '1px solid #444', color: '#888', borderRadius: '5px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px'}}>Sair</button>
      </header>
      
      <div className="tabs">
        {["Matérias", "Flashcards", "Relatório"].map((t) => (
          <button key={t} className={`tab-btn ${aba === t ? "active" : ""}`} onClick={() => setAba(t)}>{t}</button>
        ))}
      </div>

      <div className={`timer-widget ${rodando ? "timer-rodando" : ""}`}>
        <div className="timer-info">
          <span className="timer-label">{rodando ? "ESTUDANDO" : "PAUSADO"}</span>
          <div className="timer-clock">{formatar(tempo)}</div>
        </div>
        <div className="timer-btns">
          <button onClick={() => setRodando(!rodando)} className="btn-icon">{rodando ? "⏸️" : "▶️"}</button>
          <button onClick={salvarSessao} title="Salvar Sessão" className="btn-icon">💾</button>
          <button onClick={() => {setRodando(false); setTempo(0)}} title="Zerar" className="btn-icon">🔄</button>
        </div>
      </div>

      {aba === "Matérias" && (
        <div className="section">
          <div className="input-group">
            <input className="input-main" placeholder="Nova matéria..." value={novaMat} onChange={(e) => setNovaMat(e.target.value)} />
            <button className="btn-create" onClick={criarMateria}>Criar</button>
          </div>
          {materias.map((m) => (
            <div key={m.id} className="materia-card">
              <div onClick={() => alternarMateria(m.id)} className="materia-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>{expandidas[m.id] ? "▼" : "▶"}</span>
                  <h3 style={{ margin: 0 }}>📁 {m.nome}</h3>
                </div>
                <button onClick={(e) => deletarMateria(e, m.id)} className="btn-delete-small">Excluir</button>
              </div>
              {expandidas[m.id] && (
                <div className="materia-content" style={{ padding: "15px", borderTop: "1px solid #334155", background: "rgba(0,0,0,0.2)" }}>
                  <div className="input-group">
                    <input className="input-main" id={`input-tema-${m.id}`} placeholder="Novo tema..." />
                    <button className="btn-create" style={{ background: "#22c55e" }} onClick={() => criarTema(m.id)}>+</button>
                  </div>
                  {m.temas?.map((t) => (
                    <div key={t.id} className="tema-item">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                        <h4 style={{ margin: 0 }}>📍 {t.nome}</h4>
                        <label className="btn-anexo" style={{ cursor: "pointer", fontSize: "12px", background: "rgba(168, 85, 247, 0.2)", padding: "4px 8px", borderRadius: "4px", border: "1px solid #a855f7" }}>
                          📎 Anexar
                          <input type="file" hidden accept="application/pdf,image/*" onChange={(e) => anexarArquivo(t.id, e.target.files[0])} />
                        </label>
                      </div>
                      <textarea className="textarea-notas" placeholder="Suas anotações..." defaultValue={t.notas} onBlur={(e) => supabase.from("temas").update({ notas: e.target.value }).eq("id", t.id)} />
                      <div className="anexos-list" style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                        {t.anexos?.map(a => (
                          <div key={a.id} className="anexo-tag" style={{ background: "#1e293b", padding: "2px 10px", borderRadius: "12px", fontSize: "11px", display: "flex", alignItems: "center", gap: "5px", border: "1px solid #334155" }}>
                            <a href={`${a.url}?t=${Date.now()}`} target="_blank" rel="noopener noreferrer" style={{ color: "#a855f7", textDecoration: "none" }}>
                              {a.nome_arquivo.toLowerCase().endsWith('.pdf') ? "📕" : "📄"} {a.nome_arquivo}
                            </a>
                            <button onClick={() => deletarAnexo(a.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: "bold" }}>×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {aba === "Flashcards" && (
        <div className="section">
          <form className="materia-card" style={{padding: '20px'}} onSubmit={criarFlashcard}>
            <input name="tema" className="input-main" placeholder="Tema (Ex: Anatomia)" required style={{ marginBottom: "10px", width: "95%" }} />
            <input name="pergunta" className="input-main" placeholder="Pergunta" required style={{ marginBottom: "10px", width: "95%" }} />
            <input name="resposta" className="input-main" placeholder="Resposta" required style={{ marginBottom: "10px", width: "95%" }} />
            <button className="btn-save" style={{ width: "100%", background: "#22c55e", color: "white", fontWeight: "bold" }} type="submit">Adicionar Flashcard</button>
          </form>
          <div className="input-group" style={{ marginTop: "20px" }}>
            <input className="input-main" placeholder="Filtrar por tema ou pergunta..." value={buscaFlash} onChange={(e) => setBuscaFlash(e.target.value)} />
          </div>
          <div style={{ marginTop: "20px" }}>
            {Object.keys(flashcards.reduce((acc, card) => {
              const t = card.tema || "Sem Tema";
              if (!acc[t]) acc[t] = [];
              acc[t].push(card);
              return acc;
            }, {})).map(tema => (
              <details key={tema} className="materia-card" style={{ marginBottom: "15px" }} open={buscaFlash !== ""}>
                <summary style={{ cursor: "pointer", fontWeight: "bold", padding: "15px" }}>📂 {tema}</summary>
                <div style={{ padding: "10px" }}>
                  {flashcards.filter(f => f.tema === tema && (f.pergunta.toLowerCase().includes(buscaFlash.toLowerCase()))).map((f) => (
                    <div key={f.id} className="tema-item" style={{position: 'relative'}}>
                      <button onClick={() => deletarFlashcard(f.id)} className="btn-delete-icon" style={{position: 'absolute', right: '15px', top: '15px', background: 'none', border: 'none', cursor: 'pointer'}}>🗑️</button>
                      <p><strong>Q:</strong> {f.pergunta}</p>
                      <details><summary style={{ cursor: "pointer", color: "#3b82f6" }}>Ver Resposta</summary><p className="resposta-box">{f.resposta}</p></details>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {aba === "Relatório" && (
        <div className="section">
          <div className="materia-card" style={{padding: '20px'}}>
            <h2 style={{marginTop: 0, color: "white"}}>Resumo de Estudos</h2>
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap", background: "rgba(255,255,255,0.05)", padding: "15px", borderRadius: "8px" }}>
              <div style={{ flex: 1, minWidth: "120px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "5px", color: "#aaa" }}>Início:</label>
                <input type="date" style={{ width: "100%", padding: "8px", borderRadius: "5px", border: "1px solid #444", background: "#1a1a1a", color: "white" }} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: "120px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "5px", color: "#aaa" }}>Fim:</label>
                <input type="date" style={{ width: "100%", padding: "8px", borderRadius: "5px", border: "1px solid #444", background: "#1a1a1a", color: "white" }} value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
              <button onClick={() => {setDataInicio(""); setDataFim("");}} style={{ alignSelf: "flex-end", padding: "10px", borderRadius: "5px", border: "none", background: "#444", cursor: "pointer" }}>🧹</button>
            </div>
            <div style={{ textAlign: "center", marginBottom: "25px", background: "rgba(34, 197, 94, 0.15)", border: "2px solid #22c55e", padding: "20px", borderRadius: "12px" }}>
              <span style={{ color: "#22c55e", fontSize: "12px", fontWeight: "bold", letterSpacing: "1px" }}>TOTAL NO PERÍODO</span>
              <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "white", marginTop: "5px" }}>{formatar(totalSegundosFiltrados)}</div>
            </div>
            <div className="sessao-lista">
              {sessoesFiltradas.map((s) => (
                <div key={s.id} className="sessao-item" style={{ display: "flex", justifyContent: "space-between", padding: "10px", borderBottom: "1px solid #333" }}>
                  <span>📅 {s.data_estudo ? new Date(s.data_estudo).toLocaleDateString("pt-BR") : "Sem data"}</span>
                  <span style={{ fontWeight: "bold", color: "#22c55e" }}>⏱️ {formatar(s.segundos_totais || 0)}</span>
                </div>
              ))}
            </div>
            {sessoes.length > 0 && <button onClick={zerarHistorico} style={{ marginTop: "30px", width: "100%", padding: "10px", background: "rgba(239, 68, 68, 0.1)", border: "1px dashed #ef4444", color: "#ef4444", borderRadius: "8px", cursor: "pointer", fontSize: "0.8rem" }}>⚠️ Limpar Histórico de Sessões</button>}
          </div>
        </div>
      )}
    </div>
  );
}