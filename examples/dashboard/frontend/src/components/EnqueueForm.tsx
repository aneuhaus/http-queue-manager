import { useState } from 'react';
import { useMutation, gql } from '@apollo/client';
import { Plus, Play } from 'lucide-react';

const ENQUEUE = gql`
  mutation Enqueue($input: EnqueueInput!) {
    enqueue(input: $input) {
      id
    }
  }
`;

export function EnqueueForm() {
  const [url, setUrl] = useState('https://httpbin.org/get');
  const [method, setMethod] = useState('GET');
  const [enqueue, { loading }] = useMutation(ENQUEUE);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await enqueue({
        variables: {
          input: {
            url,
            method,
            priority: 50,
          }
        }
      });
      // Optional: Show success toast
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulk = async () => {
    for (let i = 0; i < 10; i++) {
        await enqueue({
            variables: { input: { url: `https://httpbin.org/get?id=${i}`, method: 'GET' } }
        });
    }
  };

  return (
    <div className="glass-panel p-4 flex-col gap-4">
      <div className="text-lg flex-row gap-2">
        <Plus size={20} className="text-accent" />
        Enqueue Request
      </div>

      <form onSubmit={handleSubmit} className="flex-col gap-4">
        <div className="flex-col gap-2">
          <label className="text-sm text-secondary">URL</label>
          <input 
            type="text" 
            className="glass-panel p-2" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>

        <div className="flex-row gap-4">
          <div className="flex-col gap-2 flex-1">
            <label className="text-sm text-secondary">Method</label>
            <select 
              className="glass-panel p-2"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
            </select>
          </div>
          <div className="flex-col gap-2 flex-1">
            <label className="text-sm text-secondary">&nbsp;</label>
            <button type="submit" className="btn flex-1 justify-center" disabled={loading}>
              <Play size={16} /> Send
            </button>
          </div>
        </div>
      </form>
      
      <div className="border-t border-white/10 pt-4">
          <button type="button" onClick={handleBulk} className="btn btn-secondary w-full justify-center" disabled={loading}>
              Simulate Load (10 reqs)
          </button>
      </div>
    </div>
  );
}
