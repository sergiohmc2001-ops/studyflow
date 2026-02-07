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
  const [notasAbertas, setNotasAbertas] = useState({});
  const [editandoNota, setEditandoNota] = useState(null);
  const [textoNota, setTextoNota] = useState(""); 
  const [carregando, setCarregando] = useState(true);
  const [usuario, setUsuario] = useState(null);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

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

  async function lidarAuth(tipo) {
    if (!email || !senha) return alert("Preencha email e senha!");
    const { error } = tipo === 'login' 
      ? await supabase.auth.signInWithPassword({ email, password: senha })
      : await supabase.auth.signUp({ email, password: senha });
    if (error) alert(error.message);
  }

  async function criarMateria() {
    if (!novaMat) return;
    await supabase.from("materias").insert([{ nome: novaMat, user_id: usuario.id }]);
    setNovaMat("");
    carregarTudo();
  }

  async function deletarMateria(e, id) {
    e.stopPropagation();
    if (!confirm("Excluir matéria e tudo dentro dela?")) return;
    await supabase.from("materias").delete().eq("id", id);
    carregarTudo();
  }

  async function criarTema(materiaId) {
    const input = document.getElementById(`input-tema-${materiaId}`);
    if (!input?.value) return;
    await supabase.from("temas").insert([{ materia_id: materiaId, nome: input.value, user_id: usuario.id, status: 'critico' }]);
    input.value = "";
    carregarTudo();
  }

  async function alternarStatus(temaId, statusAtual) {
    const ordens = ['critico', 'leitura', 'revisado'];
    const proximo = ordens[(ordens.indexOf(statusAtual || 'critico') + 1) % ordens.length];
    await supabase.from("temas").update({ status: proximo }).eq("id", temaId);
    carregarTudo();
  }

  async function salvarNota(temaId) {
    const { error } = await supabase.from("temas").update({ notas: textoNota }).eq("id", temaId);
    if (!error) {
      setEditandoNota(null);
      carregarTudo();
    }
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
    if (!error) { form.reset(); carregarTudo(); }
  }

  async function deletarFlashcard(id) {
    if (!confirm("Excluir este flashcard?")) return;
    await supabase.from("flashcards").delete().eq("id", id);
    carregarTudo();
  }

  async function deletarPastaFlashcard(temaNome) {
    if (!confirm(`Deseja excluir a pasta "${temaNome}" e TODOS os seus cards permanentemente?`)) return;
    await supabase.from("flashcards").delete().eq("tema", temaNome).eq("user_id", usuario.id);
    carregarTudo();
  }

  async function revisarFlashcard(id, nivel) {
    let dias = nivel === 'facil' ? 4 : nivel === 'medio' ? 2 : 0;
    const hoje = new Date();
    hoje.setDate(hoje.getDate() + dias);
    const dataFormatada = hoje.toISOString().split('T')[0];
    await supabase.from("flashcards").update({ proxima_revisao: dataFormatada }).eq("id", id);
    carregarTudo();
  }

  const formatar = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const seg = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
  };

  async function salvarSessao() {
    if (tempo < 1) return;
    setRodando(false);
    await supabase.from("sessoes_estudo").insert([{ segundos_totais: tempo, user_id: usuario.id }]); 
    setTempo(0); 
    carregarTudo();
  }

  async function anexarArquivo(temaId, file) {
    if (!file) return;
    try {
      const nomeNoStorage = `${usuario.id}/${temaId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const { error: uploadError } = await supabase.storage.from("anexos").upload(nomeNoStorage, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("anexos").getPublicUrl(nomeNoStorage);
      const { error: dbError } = await supabase.from("anexos").insert([{ 
        tema_id: temaId, 
        nome_arquivo: file.name, 
        url: data.publicUrl, 
        user_id: usuario.id 
      }]);
      
      if (dbError) throw dbError;
      carregarTudo();
    } catch (err) {
      alert("Erro ao anexar: " + err.message);
    }
  }

  // FUNÇÃO DE EXCLUIR ANEXO SEM MEXER NO SCHEMA
  async function deletarAnexo(e, anexoId) {
    e.preventDefault();
    if (!confirm("Excluir este anexo?")) return;
    await supabase.from("anexos").delete().eq("id", anexoId);
    carregarTudo();
  }

  if (carregando) return <div className="container" style={{color: 'white', textAlign: 'center', marginTop: '50px'}}>Carregando StudyFlow...</div>;

  if (!usuario) {
    return (
      <div className="container">
        <h1 className="title">STUDYFLOW</h1>
        <div className="materia-card" style={{padding: '30px', maxWidth: '400px', margin: '40px auto'}}>
          <h2 style={{color: 'white', marginTop: 0, textAlign: 'center'}}>Acesso</h2>
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
      <header style={{ textAlign: 'center', marginBottom: '30px', position: 'relative' }}>
        <h1 className="title">STUDYFLOW</h1>
        <button onClick={() => supabase.auth.signOut()} className="btn-delete-small" style={{position: 'absolute', right: 0, top: '10px'}}>Sair</button>
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
          <button onClick={salvarSessao} title="Salvar" className="btn-icon">💾</button>
          <button onClick={() => {setRodando(false); setTempo(0)}} title="Zerar" className="btn-icon">🔄</button>
        </div>
      </div>

      {aba === "Matérias" && (
        <div className="section">
          <div className="input-group">
            <input className="input-main" placeholder="Nova matéria..." value={novaMat} onChange={(e) => setNovaMat(e.target.value)} />
            <button className="btn-create" onClick={criarMateria}>Criar</button>
          </div>
          {materias.map((m) => {
            const totalTemas = m.temas?.length || 0;
            const pontos = m.temas?.reduce((acc, t) => {
                if (t.status === 'revisado') return acc + 3; 
                if (t.status === 'leitura') return acc + 2;   
                return acc + 1; 
            }, 0) || 0;

            const progresso = totalTemas > 0 ? Math.round((pontos / (totalTemas * 3)) * 100) : 0;
            const corBarra = progresso > 70 ? 'var(--green)' : progresso > 35 ? '#eab308' : 'var(--red)';

            return (
              <div key={m.id} className="materia-card">
                <div onClick={() => setExpandidas(p => ({...p, [m.id]: !p[m.id]}))} className="materia-header" style={{ padding: "15px", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0 }}>{expandidas[m.id] ? "▼" : "▶"} 📁 {m.nome}</h3>
                    <button onClick={(e) => deletarMateria(e, m.id)} className="btn-delete-small">Excluir</button>
                  </div>
                  <div style={{ marginTop: '10px', background: '#334155', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ 
                        width: `${progresso}%`, 
                        background: corBarra, 
                        height: '100%', 
                        transition: '0.6s ease-in-out',
                        boxShadow: `0 0 10px ${corBarra}55`
                    }}></div>
                  </div>
                </div>
                {expandidas[m.id] && (
                  <div className="materia-content" style={{ padding: "15px", borderTop: "1px solid #334155" }}>
                    <div className="input-group">
                      <input className="input-main" id={`input-tema-${m.id}`} placeholder="Novo tema..." />
                      <button className="btn-create" style={{ background: "#22c55e" }} onClick={() => criarTema(m.id)}>+</button>
                    </div>
                    {m.temas?.map((t) => (
                      <div key={t.id} className="tema-item" style={{marginBottom: '10px'}}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div onClick={() => alternarStatus(t.id, t.status)} style={{ width: '12px', height: '12px', borderRadius: '50%', cursor: 'pointer', background: t.status === 'revisado' ? 'var(--green)' : t.status === 'leitura' ? '#eab308' : 'var(--red)', boxShadow: '0 0 5px currentColor' }} />
                            <h4 style={{ margin: 0 }}>{t.nome}</h4>
                          </div>
                          <div style={{ display: "flex", gap: "5px" }}>
                            <button onClick={() => setNotasAbertas(p => ({...p, [t.id]: !p[t.id]}))} className="btn-anexo" style={{color: '#3b82f6', borderColor: '#3b82f6', background: 'transparent', cursor: 'pointer'}}>📝</button>
                            <label className="btn-anexo" style={{cursor: 'pointer'}}>📎<input type="file" hidden onChange={(e) => anexarArquivo(t.id, e.target.files[0])} /></label>
                          </div>
                        </div>

                        {/* LISTA DE ANEXOS COM (X) PARA EXCLUIR */}
                        {t.anexos && t.anexos.length > 0 && (
                          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px', paddingLeft: '22px' }}>
                            {t.anexos.map(anexo => (
                              <div key={anexo.id} style={{ display: 'flex', alignItems: 'center', background: 'rgba(59,130,246,0.1)', borderRadius: '4px', border: '1px solid #3b82f6', overflow: 'hidden' }}>
                                <a href={anexo.url} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: '#3b82f6', textDecoration: 'none', padding: '2px 6px' }}>
                                  📄 {anexo.nome_arquivo}
                                </a>
                                <button onClick={(e) => deletarAnexo(e, anexo.id)} style={{ background: '#3b82f6', color: 'white', border: 'none', cursor: 'pointer', padding: '2px 5px', fontSize: '10px' }}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {notasAbertas[t.id] && (
                          <div style={{marginTop: '10px', background: '#0f172a', padding: '10px', borderRadius: '5px'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px'}}>
                              <span style={{fontSize: '10px', color: '#64748b'}}>ANOTAÇÕES</span>
                              {editandoNota === t.id ? (
                                <button onClick={() => salvarNota(t.id)} className="btn-save" style={{padding: '2px 10px', fontSize: '10px', background: '#22c55e'}}>Salvar</button>
                              ) : (
                                <button onClick={() => { setEditandoNota(t.id); setTextoNota(t.notas || ""); }} className="btn-save" style={{padding: '2px 10px', fontSize: '10px', background: '#3b82f6'}}>Editar</button>
                              )}
                            </div>
                            {editandoNota === t.id ? (
                              <textarea 
                                className="textarea-notas" 
                                value={textoNota} 
                                onChange={(e) => setTextoNota(e.target.value)}
                                autoFocus
                              />
                            ) : (
                              <div style={{fontSize: '14px', whiteSpace: 'pre-wrap', color: t.notas ? '#e2e8f0' : '#475569', minHeight: '30px', padding: '10px'}}>
                                {t.notas || "Nenhuma anotação ainda..."}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {aba === "Flashcards" && (
        <div className="section">
          <form className="materia-card" style={{padding: '20px'}} onSubmit={criarFlashcard}>
            <input name="tema" className="input-main" placeholder="Tema da Pasta" required style={{ marginBottom: "10px", width: "100%" }} />
            <input name="pergunta" className="input-main" placeholder="Pergunta" required style={{ marginBottom: "10px", width: "100%" }} />
            <input name="resposta" className="input-main" placeholder="Resposta" required style={{ marginBottom: "10px", width: "100%" }} />
            <button className="btn-save" style={{ width: "100%", background: "#22c55e" }} type="submit">Adicionar Flashcard</button>
          </form>

          <div className="input-group" style={{ marginTop: "20px" }}>
            <input className="input-main" placeholder="🔎 Busque para filtrar ou excluir cards..." value={buscaFlash} onChange={(e) => setBuscaFlash(e.target.value)} />
          </div>

          <div style={{ marginTop: "20px" }}>
            {Object.keys(flashcards.reduce((acc, card) => {
              const t = card.tema || "Sem Tema";
              if (!acc[t]) acc[t] = [];
              acc[t].push(card);
              return acc;
            }, {})).map(tema => {
              const cardsDoTema = flashcards.filter(f => f.tema === tema);
              const hoje = new Date().toISOString().split('T')[0];
              const temPendencia = cardsDoTema.some(f => (f.proxima_revisao || hoje) <= hoje);
              const corBorda = temPendencia ? "#ef4444" : "#22c55e";

              return (
                <details key={tema} className="materia-card" style={{ marginBottom: "15px" }} open={buscaFlash !== ""}>
                  <summary style={{ cursor: "pointer", fontWeight: "bold", padding: "15px", display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `6px solid ${corBorda}`, borderRadius: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span>📂 {tema}</span>
                      <span style={{opacity: 0.5, fontSize: '10px'}}>{cardsDoTema.length} cards</span>
                    </div>
                    <button onClick={(e) => { e.preventDefault(); deletarPastaFlashcard(tema); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '5px' }}>🗑️</button>
                  </summary>
                  <div style={{ padding: "10px" }}>
                    {flashcards
                      .filter(f => {
                         if (f.tema !== tema) return false;
                         const termo = buscaFlash.toLowerCase();
                         if (buscaFlash !== "") return f.pergunta.toLowerCase().includes(termo) || f.tema.toLowerCase().includes(termo);
                         return (f.proxima_revisao || hoje) <= hoje;
                      })
                      .map((f) => (
                      <div key={f.id} className="tema-item" style={{position: 'relative', borderLeft: '3px solid #3b82f6', marginBottom: '10px'}}>
                        <button onClick={() => deletarFlashcard(f.id)} style={{position: 'absolute', right: '10px', top: '10px', background: 'none', border: 'none', cursor: 'pointer'}}>🗑️</button>
                        <p style={{marginRight: '30px'}}><strong>Q:</strong> {f.pergunta}</p>
                        <details>
                          <summary style={{ cursor: "pointer", color: "#3b82f6", fontSize: '12px' }}>Ver Resposta</summary>
                          <div style={{background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '5px', marginTop: '5px'}}>
                            <p>{f.resposta}</p>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '15px' }}>
                              <button onClick={() => revisarFlashcard(f.id, 'facil')} className="btn-revisao" style={{background: '#22c55e', flex: 1, padding: '5px', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '10px'}}>Fácil (4d)</button>
                              <button onClick={() => revisarFlashcard(f.id, 'medio')} className="btn-revisao" style={{background: '#eab308', flex: 1, padding: '5px', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '10px'}}>Médio (2d)</button>
                              <button onClick={() => revisarFlashcard(f.id, 'dificil')} className="btn-revisao" style={{background: '#ef4444', flex: 1, padding: '5px', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '10px'}}>Difícil (0d)</button>
                            </div>
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}

      {aba === "Relatório" && (
        <div className="section">
          <div className="materia-card" style={{padding: '20px'}}>
            <h2 style={{color: 'white', marginTop: 0}}>Relatório</h2>
            <div style={{textAlign: 'center', padding: '20px', border: '2px solid var(--green)', borderRadius: '10px'}}>
              <div style={{fontSize: '2rem', fontWeight: 'bold'}}>{formatar(sessoes.reduce((a, b) => a + (b.segundos_totais || 0), 0))}</div>
              <div style={{fontSize: '12px', color: 'var(--green)'}}>TOTAL ESTUDADO</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}