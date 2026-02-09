'use client';

/**
 * New Agent Page
 * Route for creating new agents via wizard
 */

import { useRouter } from 'next/navigation';
import CreateAgentWizard from '@/components/agents/create-agent-wizard';

export default function NewAgentPage() {
  const router = useRouter();

  const handleClose = () => {
    // Navigate back to agents list
    router.push('/agents');
  };

  const handleSuccess = (agentId: string) => {
    // Success handler will navigate to agent detail page
    // This is handled inside the wizard component
    console.log('Agent created successfully:', agentId);
  };

  return (
    <CreateAgentWizard 
      onClose={handleClose}
      onSuccess={handleSuccess}
    />
  );
}