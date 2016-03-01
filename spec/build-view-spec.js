'use babel';

import fs from 'fs-extra';
import temp from 'temp';
import specHelpers from 'atom-build-spec-helpers';
import os from 'os';

describe('BuildView', () => {
  const originalHomedirFn = os.homedir;
  let directory = null;
  let workspaceElement = null;
  const sleep = (duration) => process.platform === 'win32' ? `ping 127.0.0.1 -n ${duration} > NUL` : `sleep ${duration}`;

  temp.track();

  beforeEach(() => {
    atom.config.set('build.buildOnSave', false);
    atom.config.set('build.panelVisibility', 'Toggle');
    atom.config.set('build.saveOnBuild', false);
    atom.config.set('build.stealFocus', true);
    atom.config.set('build.notificationOnRefresh', true);
    atom.notifications.clear();

    workspaceElement = atom.views.getView(atom.workspace);
    jasmine.attachToDOM(workspaceElement);
    jasmine.unspy(window, 'setTimeout');
    jasmine.unspy(window, 'clearTimeout');

    runs(() => {
      workspaceElement = atom.views.getView(atom.workspace);
      jasmine.attachToDOM(workspaceElement);
    });

    waitsForPromise(() => {
      return specHelpers.vouch(temp.mkdir, { prefix: 'atom-build-spec-' }).then( (dir) => {
        return specHelpers.vouch(fs.realpath, dir);
      }).then( (dir) => {
        directory = dir + '/';
        atom.project.setPaths([ directory ]);
        return specHelpers.vouch(temp.mkdir, 'atom-build-spec-home');
      }).then( (dir) => {
        return specHelpers.vouch(fs.realpath, dir);
      }).then( (dir) => {
        os.homedir = () => dir;
        return atom.packages.activatePackage('build');
      });
    });
  });

  afterEach(() => {
    os.homedir = originalHomedirFn;
    fs.removeSync(directory);
  });

  describe('when output from build command should be viewed', () => {
    it('should output data even if no line break exists', () => {
      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'node',
        args: [ '-e', 'process.stdout.write(\'data without linebreak\');' ],
        sh: false
      }));

      waitsForPromise(() => specHelpers.refreshAwaitTargets());

      runs(() => atom.commands.dispatch(workspaceElement, 'build:trigger'));

      waitsFor(() => {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('success');
      });

      runs(() => {
        expect(workspaceElement.querySelector('.terminal').terminal.getContent()).toMatch(/data without linebreak/);
      });
    });

    it('should escape HTML chars so the output is not garbled or missing', () => {
      expect(workspaceElement.querySelector('.build')).not.toExist();

      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'echo "<script type=\\\"text/javascript\\\">alert(\'XSS!\')</script>"'
      }));

      waitsForPromise(() => specHelpers.refreshAwaitTargets());

      runs(() => atom.commands.dispatch(workspaceElement, 'build:trigger'));

      waitsFor(() => {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('success');
      });

      runs(() => {
        expect(workspaceElement.querySelector('.build')).toExist();
        expect(workspaceElement.querySelector('.terminal').terminal.getContent()).toMatch(/<script type="text\/javascript">alert\('XSS!'\)<\/script>/);
      });
    });
  });

  describe('when a build is triggered', () => {
    it('should include a timer of the build', () => {
      expect(workspaceElement.querySelector('.build')).not.toExist();

      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: `echo "Building, this will take some time..." && ${sleep(30)} && echo "Done!"`
      }));

      waitsForPromise(() => specHelpers.refreshAwaitTargets());

      runs(() => atom.commands.dispatch(workspaceElement, 'build:trigger'));

      // Let build run for 1.5 second. This should set the timer at "at least" 1.5
      // which is expected below. If this waits longer than 2000 ms, we're in trouble.
      waits(1500);

      runs(() => {
        expect(workspaceElement.querySelector('.build-timer').textContent).toMatch(/1.\d/);

        // stop twice to abort the build
        atom.commands.dispatch(workspaceElement, 'build:stop');
        atom.commands.dispatch(workspaceElement, 'build:stop');
      });
    });
  });

  describe('when panel orientation is altered', () => {
    it('should show the panel at the bottom spot', () => {
      expect(workspaceElement.querySelector('.build')).not.toExist();
      atom.config.set('build.panelOrientation', 'Bottom');

      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'echo this will fail && exit 1'
      }));

      waitsForPromise(() => specHelpers.refreshAwaitTargets());

      runs(() => atom.commands.dispatch(workspaceElement, 'build:trigger'));

      waitsFor(() => {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('error');
      });

      runs(() => {
        const bottomPanels = atom.workspace.getBottomPanels();
        expect(bottomPanels.length).toEqual(1);
        expect(bottomPanels[0].item.constructor.name).toEqual('BuildView');
      });
    });

    it('should show the panel at the top spot', () => {
      expect(workspaceElement.querySelector('.build')).not.toExist();
      atom.config.set('build.panelOrientation', 'Top');

      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'echo this will fail && exit 1'
      }));

      waitsForPromise(() => specHelpers.refreshAwaitTargets());

      runs(() => atom.commands.dispatch(workspaceElement, 'build:trigger'));

      waitsFor(() => {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('error');
      });

      runs(() => {
        const panels = atom.workspace.getTopPanels();
        expect(panels.length).toEqual(1);
        expect(panels[0].item.constructor.name).toEqual('BuildView');
      });
    });
  });

  describe('when build fails', () => {
    it('should keep the build scrolled to bottom', () => {
      expect(workspaceElement.querySelector('.build')).not.toExist();

      const args = Array(50).join('All work and no play');
      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: `echo "${args}" && exit 1`
      }));

      waitsForPromise(() => specHelpers.refreshAwaitTargets());

      runs(() => atom.commands.dispatch(workspaceElement, 'build:trigger'));

      waitsFor(() => {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('error');
      });

      runs(() => {
        expect(workspaceElement.querySelector('.terminal').terminal.ydisp).toBeGreaterThan(0);
      });
    });
  });
});
