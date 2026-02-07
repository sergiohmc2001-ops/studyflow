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
        <div className="materia-card" style={{padding: '30px', maxWidth: '400px', margin: '40px auto', textAlign: 'center'}}>
          <h2 style={{color: '#fff', marginBottom: '20px', letterSpacing: '2px'}}>LOGIN</h2>
          <input className="input-main" style={{width: '100%', marginBottom: '10px', boxSizing: 'border-box'}} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="input-main" style={{width: '100%', marginBottom: '20px', boxSizing: 'border-box'}} type="password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} />
          <div style={{display: 'flex', gap: '10px'}}>
            <button className="btn-pill-cyan" style={{flex: 1}} onClick={() => lidarAuth('login')}>ENTRAR</button>
            <button className="btn-logout-header" style={{flex: 1, border: '1px solid rgba(255,255,255,0.1)'}} onClick={() => lidarAuth('cadastro')}>CADASTRO</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="main-header">
        <h1 className="title">STUDYFLOW</h1>
        <button onClick={() => supabase.auth.signOut()} className="btn-logout-header">LOGOUT</button>
      </header>
      
      <div className="tabs">
        {["Matérias", "Flashcards", "Relatório"].map((t) => (
          <button key={t} className={`tab-btn ${aba === t ? "active" : ""}`} onClick={() => setAba(t)}>{t}</button>
        ))}
      </div>

      <div className="timer-widget">
        <div className="timer-info">
          <span style={{fontSize: '9px', color: rodando ? 'var(--accent-cyan)' : '#64748b', fontWeight: 'bold', display: 'block'}}>{rodando ? "ATIVO" : "ESPERA"}</span>
          <div className="timer-clock">{formatar(tempo)}</div>
        </div>
        <div style={{display: 'flex', gap: '8px'}}>
          <button onClick={() => setRodando(!rodando)} style={{background: 'none', border: '1px solid #333', borderRadius: '50%', color: '#fff', width: '35px', height: '35px', cursor: 'pointer'}}>{rodando ? "⏸" : "▶"}</button>
          <button onClick={salvarSessao} style={{background: 'none', border: '1px solid #333', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer'}}>💾</button>
        </div>
      </div>

      {aba === "Matérias" && (
        <div className="section">
          <div className="input-group">
            <input className="input-main" placeholder="Nova matéria..." value={novaMat} onChange={(e) => setNovaMat(e.target.value)} />
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
                <div onClick={() => setExpandidas(p => ({...p, [m.id]: !p[m.id]}))} className="materia-header" style={{ padding: "15px", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{expandidas[m.id] ? "▼" : "▶"} {m.nome}</h3>
                    <button onClick={(e) => deletarMateria(e, m.id)} className="btn-delete-small">Deletar</button>
                  </div>
                  <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.3)', height: '4px', borderRadius: '10px' }}>
                    <div style={{ width: `${progresso}%`, background: corBarra, height: '100%' }}></div>
                  </div>
                </div>
                {expandidas[m.id] && (
                  <div style={{ padding: "15px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="input-group">
                      <input className="input-main" id={`input-tema-${m.id}`} placeholder="Novo objetivo..." />
                      <button className="btn-pill-cyan" onClick={() => criarTema(m.id)}>+</button>
                    </div>
                    {m.temas?.map((t) => (
                      <div key={t.id} className="tema-item">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div onClick={() => alternarStatus(t.id, t.status)} style={{ width: '12px', height: '12px', borderRadius: '50%', background: t.status === 'revisado' ? 'var(--green)' : t.status === 'leitura' ? '#eab308' : 'var(--red)' }} />
                            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>{t.nome}</h4>
                          </div>
                          <div style={{ display: "flex", gap: "10px" }}>
                            <button onClick={() => setNotasAbertas(p => ({...p, [t.id]: !p[t.id]}))} style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px'}}>📝</button>
                            <label style={{cursor: 'pointer', fontSize: '18px'}}>📎<input type="file" hidden onChange={(e) => anexarArquivo(t.id, e.target.files[0])} /></label>
                          </div>
                        </div>

                        {/* LISTA DE ANEXOS RESTAURADA AQUI */}
                        {t.anexos && t.anexos.length > 0 && (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', paddingLeft: '22px' }}>
                            {t.anexos.map(anexo => (
                              <div key={anexo.id} style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,242,255,0.05)', borderRadius: '6px', border: '1px solid rgba(0,242,255,0.2)' }}>
                                <a href={anexo.url} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: 'var(--accent-cyan)', textDecoration: 'none', padding: '4px 8px' }}>{anexo.nome_arquivo}</a>
                                <button onClick={(e) => deletarAnexo(e, anexo.id)} style={{ background: 'rgba(0,242,255,0.2)', color: 'white', border: 'none', padding: '4px 6px', cursor: 'pointer' }}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {notasAbertas[t.id] && (
                          <div style={{marginTop: '15px'}}>
                            <textarea className="textarea-notas" value={textoNota} onChange={(e) => setTextoNota(e.target.value)} onFocus={() => setTextoNota(t.notas || "")} placeholder="Digite suas notas aqui..." />
                            <button onClick={() => salvarNota(t.id)} className="btn-pill-cyan" style={{width: '100%', marginTop: '8px', padding: '10px'}}>SALVAR NOTA</button>
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
            <input name="tema" className="input-main" placeholder="Tema" required style={{ marginBottom: "10px", width: "100%", boxSizing: 'border-box' }} />
            <input name="pergunta" className="input-main" placeholder="Pergunta" required style={{ marginBottom: "10px", width: "100%", boxSizing: 'border-box' }} />
            <input name="resposta" className="input-main" placeholder="Resposta" required style={{ marginBottom: "15px", width: "100%", boxSizing: 'border-box' }} />
            <button className="btn-pill-cyan" style={{ width: "100%" }} type="submit">CRIAR CARD</button>
          </form>

          {flashcards.map((f) => (
            <div key={f.id} className="materia-card" style={{padding: '15px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <span style={{fontSize: '10px', color: 'var(--accent-cyan)'}}>{f.tema}</span>
                <button onClick={() => deletarFlashcard(f.id)} className="btn-delete-small">X</button>
              </div>
              <p style={{margin: '10px 0'}}><strong>Q:</strong> {f.pergunta}</p>
              <details>
                <summary style={{cursor: 'pointer', color: 'var(--accent-cyan)', fontSize: '0.8rem'}}>Ver Resposta</summary>
                <div style={{marginTop: '10px', padding: '10px', background: '#000', borderRadius: '8px'}}>{f.resposta}</div>
                <div style={{display: 'flex', gap: '5px', marginTop: '10px'}}>
                  <button onClick={() => revisarFlashcard(f.id, 'facil')} className="btn-revisao" style={{background: 'var(--green)', flex: 1}}>FÁCIL</button>
                  <button onClick={() => revisarFlashcard(f.id, 'medio')} className="btn-revisao" style={{background: '#eab308', flex: 1}}>MÉDIO</button>
                  <button onClick={() => revisarFlashcard(f.id, 'dificil')} className="btn-revisao" style={{background: 'var(--red)', flex: 1}}>DIFÍCIL</button>
                </div>
              </details>
            </div>
          ))}
        </div>
      )}

      {aba === "Relatório" && (
        <div className="section">
          <div className="materia-card" style={{padding: '30px', textAlign: 'center'}}>
            <h2 style={{color: 'var(--accent-cyan)', fontSize: '1.2rem', marginBottom: '20px'}}>TEMPO TOTAL</h2>
            <div className="timer-clock" style={{fontSize: '3rem'}}>
              {formatar(sessoes.reduce((a, b) => a + (b.segundos_totais || 0), 0))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}