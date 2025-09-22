import { useState } from 'react';
import TeacherDashboard from './components/TeacherDashboard';
import StudentPortal from './components/StudentPortal';

const App = () => {
  const [activeTab, setActiveTab] = useState<'teacher' | 'student'>('teacher');

  return (
    <div className="container">
      <header className="card" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
        <div className="badge" style={{ margin: '0 auto 1rem', fontSize: '0.95rem' }}>
          🧠 Fermi Competition League
        </div>
        <h1 style={{ fontSize: '2.7rem', fontWeight: 800, color: '#312e81', marginBottom: '0.8rem' }}>
          Fermi Quest Arena
        </h1>
        <p style={{ maxWidth: 620, margin: '0 auto', color: '#4338ca', fontSize: '1.05rem' }}>
          Coordinate classrooms, challenge students with world-ready Fermi questions and track
          confidence-driven accuracy in a Duolingo-inspired interface.
        </p>
      </header>

      <div className="tab-switcher">
        <button
          type="button"
          className={`tab-button ${activeTab === 'teacher' ? 'active' : ''}`}
          onClick={() => setActiveTab('teacher')}
        >
          👩‍🏫 Teacher Portal
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'student' ? 'active' : ''}`}
          onClick={() => setActiveTab('student')}
        >
          🧑‍🎓 Student Arena
        </button>
      </div>

      {activeTab === 'teacher' ? <TeacherDashboard /> : <StudentPortal />}
    </div>
  );
};

export default App;
