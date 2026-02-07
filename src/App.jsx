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

  async function deletarAnexo(e, anexoId) {
    e.preventDefault();
    if (!confirm("Excluir este anexo?")) return;
    await supabase.from("anexos").delete().eq("id", anexoId);
    carregarTudo();
  }

  if (carregando) return <div className="container" style={{color: '#00f2ff', textAlign: 'center', marginTop: '50px', letterSpacing: '2px'}}>INICIALIZANDO SISTEMA...</div>;

  if (!usuario) {
    return (
      <div className="container">
        <h1 className="title">STUDYFLOW</h1>
        <div className="materia-card" style={{padding: '40px', maxWidth: '400px', margin: '40px auto', textAlign: 'center'}}>
          <h2 style={{color: '#fff', marginBottom: '30px', letterSpacing: '2px'}}>LOGIN DO PILOTO</h2>
          <input className="input-main" style={{width: '100%', marginBottom: '15px', boxSizing: 'border-box'}} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="input-main" style={{width: '100%', marginBottom: '25px', boxSizing: 'border-box'}} type="password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} />
          <div style={{display: 'flex', gap: '15px'}}>
            <button className="btn-save" style={{flex: 1, padding: '15px'}} onClick={() => lidarAuth('login')}>ENTRAR</button>
            <button className="btn-create" style={{flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)'}} onClick={() => lidarAuth('cadastro')}>CADASTRO</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header style={{ textAlign: 'center', marginBottom: '50px', position: 'relative' }}>
        <h1 className="title">STUDYFLOW</h1>
        <button onClick={() => supabase.auth.signOut()} className="btn-delete-small" style={{position: 'absolute', right: 0, top: '20px'}}>LOGOUT</button>
      </header>
      
      <div className="tabs">
        {["Matérias", "Flashcards", "Relatório"].map((t) => (
          <button key={t} className={`tab-btn ${aba === t ? "active" : ""}`} onClick={() => setAba(t)}>{t}</button>
        ))}
      </div>

      <div className="timer-widget">
        <div className="timer-info">
          <span style={{fontSize: '10px', color: rodando ? 'var(--accent-cyan)' : '#64748b', fontWeight: 'bold'}}>{rodando ? "SISTEMA ATIVO" : "SISTEMA EM ESPERA"}</span>
          <div className="timer-clock">{formatar(tempo)}</div>
        </div>
        <div className="timer-btns" style={{display: 'flex', gap: '10px'}}>
          <button onClick={() => setRodando(!rodando)} className="btn-icon" style={{background: 'none', border: '1px solid #333', borderRadius: '50%', color: '#fff'}}>{rodando ? "⏸" : "▶"}</button>
          <button onClick={salvarSessao} title="Salvar" style={{background: 'none', border: '1px solid #333', borderRadius: '50%'}}>💾</button>
        </div>
      </div>

      {aba === "Matérias" && (
        <div className="section">
          <div className="input-group">
            <input className="input-main" placeholder="Identificar nova matéria..." value={novaMat} onChange={(e) => setNovaMat(e.target.value)} />
            <button className="btn-pill-cyan" onClick={criarMateria}>ADICIONAR</button>
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
                <div onClick={() => setExpandidas(p => ({...p, [m.id]: !p[m.id]}))} className="materia-header" style={{ padding: "20px", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, letterSpacing: '1px', color: '#fff' }}>{expandidas[m.id] ? "▼" : "▶"} {m.nome}</h3>
                    <button onClick={(e) => deletarMateria(e, m.id)} className="btn-delete-small">Deletar</button>
                  </div>
                  <div style={{ marginTop: '15px', background: 'rgba(0,0,0,0.3)', height: '4px', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ width: `${progresso}%`, background: corBarra, height: '100%', boxShadow: `0 0 10px ${corBarra}` }}></div>
                  </div>
                </div>
                {expandidas[m.id] && (
                  <div className="materia-content" style={{ padding: "20px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="input-group">
                      <input className="input-main" id={`input-tema-${m.id}`} placeholder="Novo objetivo..." />
                      <button className="btn-pill-cyan" onClick={() => criarTema(m.id)}>+</button>
                    </div>
                    {m.temas?.map((t) => (
                      <div key={t.id} className="tema-item">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                            <div onClick={() => alternarStatus(t.id, t.status)} style={{ width: '10px', height: '10px', borderRadius: '50%', cursor: 'pointer', background: t.status === 'revisado' ? 'var(--green)' : t.status === 'leitura' ? '#eab308' : 'var(--red)', boxShadow: `0 0 10px currentColor` }} />
                            <h4 style={{ margin: 0, fontWeight: '500' }}>{t.nome}</h4>
                          </div>
                          <div style={{ display: "flex", gap: "10px" }}>
                            <button onClick={() => setNotasAbertas(p => ({...p, [t.id]: !p[t.id]}))} className="btn-anexo" style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px'}}>📝</button>
                            <label style={{cursor: 'pointer', fontSize: '18px'}}>📎<input type="file" hidden onChange={(e) => anexarArquivo(t.id, e.target.files[0])} /></label>
                          </div>
                        </div>

                        {t.anexos && t.anexos.length > 0 && (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px', paddingLeft: '25px' }}>
                            {t.anexos.map(anexo => (
                              <div key={anexo.id} style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,242,255,0.05)', borderRadius: '6px', border: '1px solid rgba(0,242,255,0.2)' }}>
                                <a href={anexo.url} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--accent-cyan)', textDecoration: 'none', padding: '5px 10px' }}>{anexo.nome_arquivo}</a>
                                <button onClick={(e) => deletarAnexo(e, anexo.id)} style={{ background: 'rgba(0,242,255,0.2)', color: 'white', border: 'none', padding: '5px 8px', cursor: 'pointer' }}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {notasAbertas[t.id] && (
                          <div style={{marginTop: '15px'}}>
                             <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
                              <span style={{fontSize: '10px', color: 'var(--accent-cyan)', letterSpacing: '1px'}}>DATA_LOG</span>
                              <button onClick={() => editandoNota === t.id ? salvarNota(t.id) : (setEditandoNota(t.id), setTextoNota(t.notas || ""))} className="btn-save" style={{padding: '5px 15px', fontSize: '10px'}}>
                                {editandoNota === t.id ? "CONFIRMAR" : "EDITAR"}
                              </button>
                            </div>
                            {editandoNota === t.id ? (
                              <textarea className="textarea-notas" value={textoNota} onChange={(e) => setTextoNota(e.target.value)} autoFocus />
                            ) : (
                              <div style={{fontSize: '14px', whiteSpace: 'pre-wrap', color: '#94a3b8', background: '#000', padding: '15px', borderRadius: '10px', border: '1px solid #111'}}>
                                {t.notas || "// Nenhuma informação registrada no banco."}
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
          <form className="materia-card" style={{padding: '30px'}} onSubmit={criarFlashcard}>
            <h3 style={{marginTop: 0, color: 'var(--accent-cyan)', letterSpacing: '2px'}}>NOVA UNIDADE DE DADOS</h3>
            <input name="tema" className="input-main" placeholder="Tema" required style={{ marginBottom: "15px", width: "100%", boxSizing: 'border-box' }} />
            <input name="pergunta" className="input-main" placeholder="Pergunta" required style={{ marginBottom: "15px", width: "100%", boxSizing: 'border-box' }} />
            <input name="resposta" className="input-main" placeholder="Resposta" required style={{ marginBottom: "25px", width: "100%", boxSizing: 'border-box' }} />
            <button className="btn-pill-cyan" style={{ width: "100%", padding: '15px' }} type="submit">SINCRONIZAR FLASHCARD</button>
          </form>

          <input className="input-main" style={{width: '100%', boxSizing: 'border-box', marginBottom: '20px'}} placeholder="🔎 Filtrar base de dados..." value={buscaFlash} onChange={(e) => setBuscaFlash(e.target.value)} />

          {Object.keys(flashcards.reduce((acc, card) => {
              const t = card.tema || "Sem Tema";
              if (!acc[t]) acc[t] = [];
              acc[t].push(card);
              return acc;
            }, {})).map(tema => {
              const cardsDoTema = flashcards.filter(f => f.tema === tema);
              const hoje = new Date().toISOString().split('T')[0];
              const temPendencia = cardsDoTema.some(f => (f.proxima_revisao || hoje) <= hoje);

              return (
                <details key={tema} className="materia-card" open={buscaFlash !== ""}>
                  <summary style={{ cursor: "pointer", padding: "20px", display: 'flex', justifyContent: 'space-between', borderLeft: `4px solid ${temPendencia ? 'var(--red)' : 'var(--green)'}` }}>
                    <div style={{display: 'flex', gap: '15px', alignItems: 'center'}}>
                      <span style={{fontWeight: 'bold', letterSpacing: '1px'}}>PASTA: {tema}</span>
                      <span style={{fontSize: '10px', color: '#444'}}>[{cardsDoTema.length} UNIDADES]</span>
                    </div>
                    <button onClick={(e) => { e.preventDefault(); deletarPastaFlashcard(tema); }} style={{background: 'none', border: 'none', cursor: 'pointer'}}>🗑️</button>
                  </summary>
                  <div style={{ padding: "20px" }}>
                    {flashcards.filter(f => f.tema === tema).map((f) => (
                      <div key={f.id} className="tema-item" style={{borderLeft: '2px solid var(--accent-cyan)'}}>
                        <p style={{marginTop: 0}}><strong>PROMPT:</strong> {f.pergunta}</p>
                        <details>
                          <summary style={{ cursor: "pointer", color: "var(--accent-cyan)", fontSize: '11px', letterSpacing: '1px' }}>REVELAR RESPOSTA</summary>
                          <p style={{background: '#000', padding: '15px', borderRadius: '8px', border: '1px solid #111', marginTop: '10px'}}>{f.resposta}</p>
                          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={() => revisarFlashcard(f.id, 'facil')} className="btn-revisao" style={{background: 'var(--green)', flex: 1}}>FÁCIL</button>
                            <button onClick={() => revisarFlashcard(f.id, 'medio')} className="btn-revisao" style={{background: '#eab308', flex: 1}}>MÉDIO</button>
                            <button onClick={() => revisarFlashcard(f.id, 'dificil')} className="btn-revisao" style={{background: 'var(--red)', flex: 1}}>DIFÍCIL</button>
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
        </div>
      )}

      {aba === "Relatório" && (
        <div className="section">
          <div className="materia-card" style={{padding: '40px', textAlign: 'center'}}>
            <h2 style={{color: 'var(--accent-cyan)', letterSpacing: '4px', marginBottom: '40px'}}>ESTATÍSTICAS DE OPERAÇÃO</h2>
            <div style={{padding: '40px', border: '1px solid var(--accent-cyan)', borderRadius: '100%', width: '200px', height: '200px', margin: '0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 0 30px rgba(0,242,255,0.1)'}}>
              <div style={{fontSize: '2.5rem', fontWeight: '800', color: '#fff'}}>{formatar(sessoes.reduce((a, b) => a + (b.segundos_totais || 0), 0))}</div>
              <div style={{fontSize: '10px', color: 'var(--accent-cyan)', marginTop: '10px'}}>TEMPO TOTAL</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}